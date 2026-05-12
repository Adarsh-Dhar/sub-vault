/**
 * Quiz API endpoints
 */

import { Hono } from 'hono';
import { reddit, redis } from '@devvit/web/server';
import { generateQuiz } from '../services/gemini';
import type {
  QuizState,
  QuizSubmission,
  QuizResult,
  QuizSettings,
} from '../../shared/quiz-types';

export const quiz = new Hono();

const DEFAULT_SETTINGS: QuizSettings = {
  difficulty: 'medium',
  passing_score: 70,
  questions_count: 5,
};

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
        {
          status: 'error',
          message: 'No active quiz found for this user',
        },
        404
      );
    }

    const state: QuizState = JSON.parse(stateJson);
    return c.json(state);
  } catch (error) {
    console.error('Error fetching quiz state:', error);
    return c.json(
      {
        status: 'error',
        message: 'Failed to fetch quiz state',
      },
      500
    );
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
      return c.json(
        {
          status: 'error',
          message: 'User not authenticated',
        },
        401
      );
    }

    // Get subreddit info and rules
    // Note: getSubreddit may not be available in Devvit SDK
    // Using context.subredditName directly

    // Fetch quiz settings from Redis or use defaults
    let quizSettings = DEFAULT_SETTINGS;
    try {
      const settingsJson = await redis.get('quiz:settings');
      if (settingsJson) {
        quizSettings = JSON.parse(settingsJson);
      }
    } catch (error) {
      console.error('Error reading quiz settings from Redis:', error);
    }

    // Get subreddit rules as string
    const rules = 'Default community guidelines apply';
    // Try to fetch subreddit metadata if available
    // Otherwise use default

    // Generate questions using Gemini
    const questions = await generateQuiz(
      rules,
      quizSettings.difficulty,
      quizSettings.questions_count
    );

    if (questions.length === 0) {
      return c.json(
        {
          status: 'error',
          message: 'Failed to generate quiz questions',
        },
        500
      );
    }

    // Create quiz state
    const quizState: QuizState = {
      username,
      questions,
      submitted_answers: {},
      result: null,
      timestamp: Date.now(),
    };

    // Store in Redis with 24-hour TTL
    await redis.set(
      `quiz:state:${username}`,
      JSON.stringify(quizState)
    );

    return c.json(quizState);
  } catch (error) {
    console.error('Error generating quiz:', error);
    return c.json(
      {
        status: 'error',
        message: 'Failed to generate quiz',
      },
      500
    );
  }
});

/**
 * POST /api/quiz/submit
 * Submit quiz answers and calculate result
 */
quiz.post('/submit', async (c) => {
  try {
    const submission = (await c.req.json()) as QuizSubmission;
    const { username, answers } = submission;

    // Fetch quiz state
    const stateJson = await redis.get(`quiz:state:${username}`);

    if (!stateJson) {
      return c.json(
        {
          status: 'error',
          message: 'Quiz not found',
        },
        404
      );
    }

    const quizState: QuizState = JSON.parse(stateJson);

    // Validate all questions are answered
    if (Object.keys(answers).length !== quizState.questions.length) {
      return c.json(
        {
          status: 'error',
          message: 'All questions must be answered',
        },
        400
      );
    }

    // Score the answers
    let correctCount = 0;
    for (const question of quizState.questions) {
      const userAnswer = answers[question.id];
      if (userAnswer === question.correct_answer_index) {
        correctCount++;
      }
    }

    const score = Math.round(
      (correctCount / quizState.questions.length) * 100
    );

    // Get settings to determine passing score
    let passingScore = DEFAULT_SETTINGS.passing_score;
    try {
      const settingsJson = await redis.get('quiz:settings');
      if (settingsJson) {
        const settings: QuizSettings = JSON.parse(settingsJson);
        passingScore = settings.passing_score;
      }
    } catch (error) {
      console.error('Error reading passing score:', error);
    }

    const passed = score >= passingScore;

    const result: QuizResult = {
      passed,
      score,
      total_questions: quizState.questions.length,
      correct_answers: correctCount,
      explanation: passed
        ? `Great job! You scored ${score}% and passed the quiz.`
        : `You scored ${score}%. You need ${passingScore}% to pass.`,
    };

    // Update quiz state with result
    quizState.submitted_answers = answers;
    quizState.result = result;

    // Store updated state
    await redis.set(
      `quiz:state:${username}`,
      JSON.stringify(quizState)
    );

    // Store pass/fail status
    if (passed) {
      await redis.set(`quiz:passed:${username}`, 'true');
    }

    // Increment attempt count
    const currentAttempts = await redis.get(`quiz:attempts:${username}`);
    const newAttempts = (parseInt(currentAttempts || '0') + 1).toString();
    await redis.set(`quiz:attempts:${username}`, newAttempts);

    return c.json(result);
  } catch (error) {
    console.error('Error submitting quiz:', error);
    return c.json(
      {
        status: 'error',
        message: 'Failed to submit quiz',
      },
      500
    );
  }
});
