import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  DecrementResponse,
  IncrementResponse,
} from '../../shared/api';
import type { QuizSettings } from '../../shared/quiz-types';
import { getQuizSettings } from '../services/quiz-data';

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

    // Check if current user is a moderator
    let isModerator = false;
    if (username) {
      try {
        const subName = context.subredditName;
        if (subName) {
          const moderators = [];
          for await (const m of reddit.getModerators({ subredditName: subName })) {
            moderators.push(m.username);
            if (moderators.length >= 100) break;
          }
          isModerator = moderators.includes(username);
        }
      } catch (err) {
        console.warn('Error checking moderator status:', err);
      }
    }

    return c.json({
      type: 'init',
      postId: postId,
      count: count ? parseInt(count) : 0,
      username: username ?? 'anonymous',
      isModerator,
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
 * GET /api/user/karma
 * Fetch total karma for the current user
 */
api.get('/user/karma', async (c) => {
  try {
    const username = await reddit.getCurrentUsername();
    if (!username) {
      return c.json({ error: 'User not authenticated' }, 401);
    }

    const user = await reddit.getUserByUsername(username);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ karma: user.linkKarma + user.commentKarma });
  } catch (err) {
    console.error('Failed to fetch user karma:', err);
    return c.json({ error: 'Failed to fetch karma' }, 500);
  }
});

/**
 * GET /api/quiz-settings
 * Fetch current quiz settings
 */
api.get('/quiz-settings', async (c) => {
  try {
    const settings = await getQuizSettings(); // handles both native settings and Redis fallback
    return c.json(settings);
  } catch (error) {
    console.error('Error fetching quiz settings:', error);
    return c.json({ error: 'Failed to fetch settings' }, 500);
  }
});

/**
 * POST /api/quiz-settings
 * Update quiz settings (moderator-only)
 * Validates all 10 settings fields
 */
api.post('/quiz-settings', async (c) => {
  try {
    const newSettings = (await c.req.json()) as Partial<QuizSettings>;

    // Validate difficulty
    if (newSettings.difficulty && !['easy', 'medium', 'hard'].includes(newSettings.difficulty)) {
      return c.json({ error: 'Invalid difficulty level' }, 400);
    }

    // Validate passing_score
    if (newSettings.passing_score !== undefined) {
      if (typeof newSettings.passing_score !== 'number' || newSettings.passing_score < 0 || newSettings.passing_score > 100) {
        return c.json({ error: 'Passing score must be between 0 and 100' }, 400);
      }
    }

    // Validate questions_count
    if (newSettings.questions_count !== undefined) {
      if (typeof newSettings.questions_count !== 'number' || newSettings.questions_count < 1 || newSettings.questions_count > 50) {
        return c.json({ error: 'Questions count must be between 1 and 50' }, 400);
      }
    }

    // Validate pass_flair_text
    if (newSettings.pass_flair_text !== undefined) {
      if (typeof newSettings.pass_flair_text !== 'string' || newSettings.pass_flair_text.length > 64) {
        return c.json({ error: 'Flair text must be a string under 64 characters' }, 400);
      }
    }

    // Validate veteran_account_age_days
    if (newSettings.veteran_account_age_days !== undefined) {
      if (typeof newSettings.veteran_account_age_days !== 'number' || newSettings.veteran_account_age_days < 0 || newSettings.veteran_account_age_days > 36500) {
        return c.json({ error: 'Veteran account age must be between 0 and 36500 days' }, 400);
      }
    }

    // Validate veteran_karma_threshold
    if (newSettings.veteran_karma_threshold !== undefined) {
      if (typeof newSettings.veteran_karma_threshold !== 'number' || newSettings.veteran_karma_threshold < 0 || newSettings.veteran_karma_threshold > 1000000) {
        return c.json({ error: 'Veteran karma threshold must be between 0 and 1000000' }, 400);
      }
    }

    // Validate welcome_dm_enabled
    if (newSettings.welcome_dm_enabled !== undefined) {
      if (typeof newSettings.welcome_dm_enabled !== 'boolean') {
        return c.json({ error: 'Welcome DM enabled must be a boolean' }, 400);
      }
    }

    // Validate welcome_dm_links (should be JSON stringified array)
    if (newSettings.welcome_dm_links !== undefined) {
      if (typeof newSettings.welcome_dm_links !== 'string') {
        return c.json({ error: 'Welcome DM links must be a JSON string' }, 400);
      }
      try {
        const parsed = JSON.parse(newSettings.welcome_dm_links);
        if (!Array.isArray(parsed)) {
          return c.json({ error: 'Welcome DM links must be a JSON array' }, 400);
        }
        // Validate array structure
        for (const link of parsed) {
          if (!link.label || !link.url || typeof link.label !== 'string' || typeof link.url !== 'string') {
            return c.json({ error: 'Each link must have label and url strings' }, 400);
          }
        }
      } catch {
        return c.json({ error: 'Welcome DM links must be valid JSON' }, 400);
      }
    }

    // Validate retry_cooldown_minutes
    if (newSettings.retry_cooldown_minutes !== undefined) {
      if (typeof newSettings.retry_cooldown_minutes !== 'number' || newSettings.retry_cooldown_minutes < 0 || newSettings.retry_cooldown_minutes > 1440) {
        return c.json({ error: 'Retry cooldown must be between 0 and 1440 minutes' }, 400);
      }
    }

    // Validate max_attempts
    if (newSettings.max_attempts !== undefined) {
      if (typeof newSettings.max_attempts !== 'number' || newSettings.max_attempts < 0 || newSettings.max_attempts > 100) {
        return c.json({ error: 'Max attempts must be between 0 and 100' }, 400);
      }
    }

    // Fetch current settings and merge
    const settingsJson = await redis.get('quiz:settings');
    const currentSettings = settingsJson
      ? (JSON.parse(settingsJson) as QuizSettings)
      : (await getQuizSettings());

    const updatedSettings: QuizSettings = {
      ...currentSettings,
      ...newSettings,
    };

    // Store updated settings
    await redis.set('quiz:settings', JSON.stringify(updatedSettings));

    return c.json(updatedSettings);
  } catch (error) {
    console.error('Error updating quiz settings:', error);
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});
