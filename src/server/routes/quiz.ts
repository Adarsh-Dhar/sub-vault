/**
 * Quiz API endpoints
 */

import { Hono } from 'hono';
import { reddit, redis } from '@devvit/web/server';
import { generateQuiz } from '../services/gemini';
import {
  assignPassFlair,
  checkVeteranStatus,
  getQuizSettings,
  getSubredditRulesText,
  isUserLockedOut,
  sendWelcomeDM,
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
 * On veteran bypass, returns special response without questions
 */
quiz.post('/generate', async (c) => {
  try {
    const username = await reddit.getCurrentUsername();

    if (!username) {
      return c.json({ status: 'error', message: 'User not authenticated' }, 401);
    }

    // Check for veteran bypass (Account Age > X days OR Karma > Y)
    const isVeteran = await checkVeteranStatus(username);
    if (isVeteran) {
      return c.json({
        status: 'veteranBypassed',
        message: 'Your account qualifies for veteran status. Quiz bypassed.',
        veteranBypassed: true,
        username,
      });
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
 * Enforces cooldowns and max attempts on failure.
 * On pass, records the result and clears lockout state.
 */
quiz.post('/submit', async (c) => {
  try {
    const submission = (await c.req.json()) as QuizSubmission;
    const { username, answers } = submission;

    // Check if user is locked out
    const lockoutStatus = await isUserLockedOut(username);
    if (lockoutStatus.locked) {
      if (lockoutStatus.reason === 'maxAttemptsReached') {
        return c.json(
          { status: 'error', message: 'Maximum attempts reached. Contact moderators.' },
          429
        );
      }
      if (lockoutStatus.reason === 'cooldownActive') {
        return c.json(
          {
            status: 'error',
            message: 'Please wait before retrying',
            cooldownSeconds: lockoutStatus.cooldownSeconds,
          },
          429
        );
      }
    }

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

      // Clear any cooldown/attempt tracking on pass
      await redis.del(`quiz:cooldown:${username}`);
      await redis.del(`quiz:attempts:${username}`);

      try {
        await assignPassFlair(username, quizSettings.pass_flair_text);
      } catch (flairError) {
        console.warn('Failed to assign pass flair:', flairError);
      }

      // Send welcome DM on pass (if enabled)
      try {
        await sendWelcomeDM(username);
      } catch (dmError) {
        console.warn('Failed to send welcome DM:', dmError);
      }
    } else {
      // On failure, increment attempts and set cooldown
      const currentAttempts = await redis.get(`quiz:attempts:${username}`);
      const newAttempts = parseInt(currentAttempts || '0', 10) + 1;
      await redis.set(`quiz:attempts:${username}`, String(newAttempts));

      // Set cooldown if enabled (sliding window: each failure starts fresh)
      if (quizSettings.retry_cooldown_minutes > 0) {
        const cooldownSeconds = quizSettings.retry_cooldown_minutes * 60;
        const expiresAt = Date.now() + cooldownSeconds * 1000;
        await redis.set(`quiz:cooldown:${username}`, String(expiresAt));
      }
    }

    return c.json(result);
  } catch (error) {
    console.error('Error submitting quiz:', error);
    return c.json({ status: 'error', message: 'Failed to submit quiz' }, 500);
  }
});

/**
 * POST /api/quiz/reset
 * Clears a user's quiz state so they can retake it
 * Also clears cooldown and attempt counters
 */
quiz.post('/reset', async (c) => {
  try {
    const { username } = (await c.req.json()) as { username: string };
    await redis.del(`quiz:state:${username}`);
    await redis.del(`quiz:cooldown:${username}`);
    await redis.del(`quiz:attempts:${username}`);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error resetting quiz:', error);
    return c.json({ error: 'Failed to reset quiz' }, 500);
  }
});

/**
 * POST /api/quiz/retry-check
 * Check if user can retry quiz or is in cooldown
 * Returns { canRetry: boolean, cooldownSeconds?: number }
 */
quiz.post('/retry-check', async (c) => {
  try {
    const { username } = (await c.req.json()) as { username: string };

    const lockoutStatus = await isUserLockedOut(username);
    if (lockoutStatus.locked) {
      return c.json({
        canRetry: false,
        reason: lockoutStatus.reason,
        cooldownSeconds: lockoutStatus.cooldownSeconds,
      });
    }

    return c.json({ canRetry: true });
  } catch (error) {
    console.error('Error checking retry status:', error);
    return c.json({ canRetry: false, error: 'Failed to check retry status' }, 500);
  }
});

/**
 * POST /api/quiz/save-progress
 * Saves user's current answers to preserve progress on page refresh
 */
quiz.post('/save-progress', async (c) => {
  try {
    const { username, answers } = (await c.req.json()) as {
      username: string;
      answers: Record<number, number>;
    };

    const stateJson = await redis.get(`quiz:state:${username}`);
    if (!stateJson) {
      return c.json({ error: 'Not found' }, 404);
    }

    const state: QuizState = JSON.parse(stateJson);
    state.submitted_answers = answers;
    await redis.set(`quiz:state:${username}`, JSON.stringify(state));
    return c.json({ saved: true });
  } catch (error) {
    console.error('Error saving progress:', error);
    return c.json({ error: 'Failed to save progress' }, 500);
  }
});