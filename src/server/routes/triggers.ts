/**
 * Trigger handlers for the quiz onboarding app
 */

import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { redis } from '@devvit/web/server';
import { generateQuiz } from '../services/gemini';
import { getQuizSettings, getSubredditRulesText } from '../services/quiz-data';
import type { QuizState } from '../../shared/quiz-types';
import type { OnModActionRequest } from '@devvit/web/shared';

export const triggers = new Hono();

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

    const quizSettings = await getQuizSettings();
    const rules = await getSubredditRulesText();

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

/**
 * POST /internal/triggers/on-mod-action
 * Handles moderator actions from the Devvit trigger pipeline.
 */
triggers.post('/on-mod-action', async (c) => {
  try {
    const input = (await c.req.json()) as OnModActionRequest;

    console.log('[Quiz] OnModAction triggered', input);

    return c.json<TriggerResponse>({}, 200);
  } catch (error) {
    console.error('[Quiz] Error in OnModAction handler:', error);
    return c.json<TriggerResponse>({}, 200);
  }
});
