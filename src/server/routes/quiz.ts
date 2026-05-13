/**
 * Quiz API endpoints
 */

import { Hono } from 'hono';
import { reddit, redis } from '@devvit/web/server';
import { generateQuiz } from '../services/gemini';
import {
  assignPassFlair,
  getQuizSettings,
  getSubredditRulesText,
} from '../services/quiz-data';
import type {
  QuizState,
  QuizSubmission,
  QuizResult,
} from '../../shared/quiz-types';

export const quiz = new Hono();

/**
 * GET /api/quiz/:username
 * Fetch current quiz state for a user
 */
quiz.get('/:username', async (c) => {
  const username = c.req.param('username');

  try {
    const stateJson = await redis.get(`quiz:state:${username}`);

    if (!stateJson) {
      return c.json(
        { status: 'error', message: 'No active quiz found for this user' },
        404
      );
    }

    const state: QuizState = JSON.parse(stateJson);
    return c.json(state);
  } catch (error) {
    console.error('Error fetching quiz state:', error);
    return c.json({ status: 'error', message: 'Failed to fetch quiz state' }, 500);
  }
});

/**
 * POST /api/quiz/generate
 * Generate a new quiz for the current user based on subreddit rules
 */
quiz.post('/generate', async (c) => {
  try {
    const username = await reddit.getCurrentUsername();

    if (!username) {
      return c.json({ status: 'error', message: 'User not authenticated' }, 401);
    }

    const quizSettings = await getQuizSettings();
    const rules = await getSubredditRulesText();

    // 1. Fetch User Comments
    let userCommentsText = '';
    try {
      const recentComments: string[] = [];
      const commentsIterator = reddit.getCommentsByUser({ username, limit: 10, sort: 'new' });
      for await (const comment of commentsIterator) {
        recentComments.push(`- ${comment.body}`);
      }
      userCommentsText = recentComments.join('\n');
    } catch (err) {
      console.warn(`[Quiz] Could not fetch comments for ${username}`);
    }

    // 2. Fetch Subreddit Context (Top Posts & Ban Reasons)
    const topPosts: string[] = [];
    const banReasons: string[] = [];
    try {
      const subreddit = await reddit.getCurrentSubreddit();
      const postsIter = subreddit.getTopPosts({ timeframe: 'month', limit: 5 });
      for await (const post of postsIter) {
        topPosts.push(post.title);
      }

      const bansIter = subreddit.getBannedUsers({ limit: 10 });
      for await (const ban of bansIter) {
        // Ban object may contain moderation details if available
        const banNote = ((ban as unknown) as Record<string, unknown>).modNote as string | undefined;
        if (banNote) banReasons.push(banNote);
      }
    } catch (err) {
      console.warn(`[Quiz] Could not fetch sub context. App might lack permissions.`);
    }

    // 3. Pass ALL context to Gemini
    const questions = await generateQuiz(
      rules,
      quizSettings.difficulty,
      quizSettings.questions_count,
      userCommentsText,
      { topPosts, banReasons }
    );

    if (questions.length === 0) {
      return c.json({ status: 'error', message: 'Failed to generate quiz questions' }, 500);
    }

    const quizState: QuizState = {
      username,
      questions,
      submitted_answers: {},
      result: null,
      timestamp: Date.now(),
    };

    // 24-hour TTL — user can refresh their quiz once a day if needed
    await redis.set(`quiz:state:${username}`, JSON.stringify(quizState));

    return c.json(quizState);
  } catch (error) {
    console.error('Error generating quiz:', error);
    return c.json({ status: 'error', message: 'Failed to generate quiz' }, 500);
  }
});

/**
 * POST /api/quiz/submit
 * Submit quiz answers and calculate result.
 * On pass, records the result against BOTH username and userId so the
 * OnPostSubmit trigger (which only knows userId) can check it reliably.
 */
quiz.post('/submit', async (c) => {
  try {
    const submission = (await c.req.json()) as QuizSubmission;
    const { username, answers } = submission;

    const stateJson = await redis.get(`quiz:state:${username}`);
    if (!stateJson) {
      return c.json({ status: 'error', message: 'Quiz not found' }, 404);
    }

    const quizState: QuizState = JSON.parse(stateJson);

    if (Object.keys(answers).length !== quizState.questions.length) {
      return c.json({ status: 'error', message: 'All questions must be answered' }, 400);
    }

    // Score the answers
    let correctCount = 0;
    for (const question of quizState.questions) {
      if (answers[question.id] === question.correct_answer_index) {
        correctCount++;
      }
    }

    const score = Math.round((correctCount / quizState.questions.length) * 100);
    const quizSettings = await getQuizSettings();
    const passed = score >= quizSettings.passing_score;

    const result: QuizResult = {
      passed,
      score,
      total_questions: quizState.questions.length,
      correct_answers: correctCount,
      explanation: passed
        ? `Great job! You scored ${score}% and passed the quiz.`
        : `You scored ${score}%. You need ${quizSettings.passing_score}% to pass.`,
    };

    // Persist the updated state
    quizState.submitted_answers = answers;
    quizState.result = result;
    await redis.set(`quiz:state:${username}`, JSON.stringify(quizState));

    if (passed) {
      // Key by username (human-readable, used by quiz UI checks)
      await redis.set(`quiz:passed:${username}`, 'true');

      // Also key by userId so the OnPostSubmit trigger can verify without
      // needing to resolve the username first
      const userId = await redis.get(`quiz:userid_by_name:${username}`);
      if (userId) {
        await redis.set(`quiz:passed:${userId}`, 'true');
      }

      // Increment attempt count
      const currentAttempts = await redis.get(`quiz:attempts:${username}`);
      await redis.set(
        `quiz:attempts:${username}`,
        String(parseInt(currentAttempts || '0') + 1)
      );

      try {
        await assignPassFlair(username, quizSettings.pass_flair_text);
      } catch (flairError) {
        console.warn('Failed to assign pass flair:', flairError);
      }
    }

    return c.json(result);
  } catch (error) {
    console.error('Error submitting quiz:', error);
    return c.json({ status: 'error', message: 'Failed to submit quiz' }, 500);
  }
});