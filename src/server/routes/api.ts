import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  DecrementResponse,
  IncrementResponse,
  InitResponse,
} from '../../shared/api';
import { DEFAULT_QUIZ_SETTINGS } from '../services/quiz-data';
import type { QuizSettings, SettingsResponse } from '../../shared/quiz-types';

type ErrorResponse = {
  status: 'error';
  message: string;
};

export const api = new Hono();

api.get('/init', async (c) => {
  const { postId } = context;

  if (!postId) {
    console.error('API Init Error: postId not found in devvit context');
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required but missing from context',
      },
      400
    );
  }

  try {
    const [count, username] = await Promise.all([
      redis.get('count'),
      reddit.getCurrentUsername(),
    ]);

    return c.json<InitResponse>({
      type: 'init',
      postId: postId,
      count: count ? parseInt(count) : 0,
      username: username ?? 'anonymous',
    });
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);
    let errorMessage = 'Unknown error during initialization';
    if (error instanceof Error) {
      errorMessage = `Initialization failed: ${error.message}`;
    }
    return c.json<ErrorResponse>(
      { status: 'error', message: errorMessage },
      400
    );
  }
});

api.post('/increment', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required',
      },
      400
    );
  }

  const count = await redis.incrBy('count', 1);
  return c.json<IncrementResponse>({
    count,
    postId,
    type: 'increment',
  });
});

api.post('/decrement', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required',
      },
      400
    );
  }

  const count = await redis.incrBy('count', -1);
  return c.json<DecrementResponse>({
    count,
    postId,
    type: 'decrement',
  });
});

api.get('/moderators', async (c) => {
  try {
    const subName = context.subredditName;
    if (!subName) {
      return c.json({ error: 'Missing subreddit context' }, 400);
    }

    const moderators: Array<{ username: string; permissions: string[] }> = [];
    for await (const m of reddit.getModerators({ subredditName: subName })) {
      moderators.push({
        username: m.username,
        permissions: (m as any).permissions ?? [],
      });
      if (moderators.length >= 100) break;
    }

    return c.json(moderators.sort((a, b) => a.username.localeCompare(b.username)));
  } catch (err) {
    console.error('[SubVault] Failed to fetch moderators:', err);
    return c.json({ error: 'Failed to fetch moderators' }, 500);
  }
});

/**
 * GET /api/settings
 * Fetch current quiz settings
 */
api.get('/settings', async (c) => {
  try {
    const settingsJson = await redis.get('quiz:settings');
    const settings = settingsJson
      ? {
          ...DEFAULT_QUIZ_SETTINGS,
          ...(JSON.parse(settingsJson) as Partial<QuizSettings>),
        }
      : DEFAULT_QUIZ_SETTINGS;

    return c.json<SettingsResponse>(settings);
  } catch (error) {
    console.error('Error fetching quiz settings:', error);
    return c.json({ error: 'Failed to fetch settings' }, 500);
  }
});

/**
 * POST /api/settings
 * Update quiz settings (moderator-only in production)
 */
api.post('/settings', async (c) => {
  try {
    const newSettings = (await c.req.json()) as Partial<QuizSettings>;

    // Validate input
    if (newSettings.difficulty && !['easy', 'medium', 'hard'].includes(newSettings.difficulty)) {
      return c.json({ error: 'Invalid difficulty level' }, 400);
    }

    if (newSettings.passing_score !== undefined) {
      if (typeof newSettings.passing_score !== 'number' || newSettings.passing_score < 0 || newSettings.passing_score > 100) {
        return c.json({ error: 'Passing score must be between 0 and 100' }, 400);
      }
    }

    if (newSettings.questions_count !== undefined) {
      if (typeof newSettings.questions_count !== 'number' || newSettings.questions_count < 1 || newSettings.questions_count > 50) {
        return c.json({ error: 'Questions count must be between 1 and 50' }, 400);
      }
    }

    // Fetch current settings
    const settingsJson = await redis.get('quiz:settings');
    const settings: QuizSettings = settingsJson
      ? {
          ...DEFAULT_QUIZ_SETTINGS,
          ...(JSON.parse(settingsJson) as Partial<QuizSettings>),
        }
      : DEFAULT_QUIZ_SETTINGS;

    // Merge with new settings
    const updatedSettings: QuizSettings = {
      ...settings,
      ...newSettings,
    };

    // Store updated settings
    await redis.set('quiz:settings', JSON.stringify(updatedSettings));

    return c.json<SettingsResponse>(updatedSettings);
  } catch (error) {
    console.error('Error updating quiz settings:', error);
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});
