/**
 * Trigger handlers for the quiz onboarding app
 */

import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { redis } from '@devvit/web/server';
import { generateQuiz } from '../services/gemini';
import type { QuizState, QuizSettings } from '../../shared/quiz-types';

export const triggers = new Hono();

const DEFAULT_SETTINGS: QuizSettings = {
  difficulty: 'medium',
  passing_score: 70,
  questions_count: 5,
};

/**
 * POST /internal/triggers/on-subscribe
 * Triggered automatically when a new user subscribes to the subreddit
 */
triggers.post('/on-subscribe', async (c) => {
  try {
    const input = await c.req.json<any>();
    const username = input.user?.name;

    if (!username) {
      console.warn('OnSubscribe trigger: No username in payload');
      return c.json<TriggerResponse>({}, 200);
    }

    console.log(`[Quiz] OnSubscribe triggered for user: ${username}`);

    // Fetch quiz settings from Redis
    let quizSettings = DEFAULT_SETTINGS;
    try {
      const settingsJson = await redis.get('quiz:settings');
      if (settingsJson) {
        quizSettings = JSON.parse(settingsJson);
      }
    } catch (error) {
      console.error('[Quiz] Error reading quiz settings:', error);
    }

    // Fetch subreddit rules
    const rules = 'Default community guidelines apply';
    // Try to fetch subreddit metadata if available
    // Otherwise use default

    // Generate quiz questions
    const questions = await generateQuiz(
      rules,
      quizSettings.difficulty,
      quizSettings.questions_count
    );

    if (questions.length === 0) {
      console.warn('[Quiz] Failed to generate questions, creating empty quiz state');
    }

    // Initialize quiz state
    const quizState: QuizState = {
      username,
      questions,
      submitted_answers: {},
      result: null,
      timestamp: Date.now(),
    };

    // Store in Redis
    await redis.set(
      `quiz:state:${username}`,
      JSON.stringify(quizState)
    );

    console.log(`[Quiz] Quiz state initialized for user: ${username}`);
    return c.json<TriggerResponse>({}, 200);
  } catch (error) {
    console.error('[Quiz] Error in OnSubscribe handler:', error);
    // Return 200 anyway - trigger handlers should not fail
    return c.json<TriggerResponse>({}, 200);
  }
});
