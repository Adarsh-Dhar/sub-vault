import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  DecrementResponse,
  IncrementResponse,
} from '../../shared/api';
import type { RankThresholdConfig } from '../../shared/rank-types';
import { DEFAULT_THRESHOLDS } from '../../shared/rank-types';

type ErrorResponse = {
  status: 'error';
  message: string;
};

function normalizeRankSettings(input: Partial<RankThresholdConfig>): RankThresholdConfig {
  return {
    0: { ...DEFAULT_THRESHOLDS[0], ...input[0] },
    1: { ...DEFAULT_THRESHOLDS[1], ...input[1] },
    2: { ...DEFAULT_THRESHOLDS[2], ...input[2] },
    3: { ...DEFAULT_THRESHOLDS[3], ...input[3] },
    4: { ...DEFAULT_THRESHOLDS[4], ...input[4] },
  };
}

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

    let isModerator = false;
    if (username) {
      try {
        const subName = context.subredditName;
        if (subName) {
          const moderators: string[] = [];
          for await (const moderator of reddit.getModerators({ subredditName: subName })) {
            moderators.push(moderator.username);
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
      postId,
      count: count ? parseInt(count) : 0,
      username: username ?? 'anonymous',
      isModerator,
    });
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);
    const errorMessage = error instanceof Error ? `Initialization failed: ${error.message}` : 'Unknown error during initialization';
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
    for await (const moderator of reddit.getModerators({ subredditName: subName })) {
      moderators.push({
        username: moderator.username,
        permissions: (moderator as any).permissions ?? [],
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
 * GET /api/rank-settings
 * Fetch current rank thresholds
 */
api.get('/rank-settings', async (c) => {
  try {
    const settingsJson = await redis.get('rank:thresholds');
    const settings = settingsJson
      ? normalizeRankSettings(JSON.parse(settingsJson) as Partial<RankThresholdConfig>)
      : DEFAULT_THRESHOLDS;
    return c.json(settings);
  } catch (error) {
    console.error('Error fetching rank settings:', error);
    return c.json({ error: 'Failed to fetch settings' }, 500);
  }
});

/**
 * POST /api/rank-settings
 * Update rank thresholds (moderator-only)
 */
api.post('/rank-settings', async (c) => {
  try {
    const newSettings = (await c.req.json()) as Partial<RankThresholdConfig>;
    const updatedSettings = normalizeRankSettings(newSettings);

    await redis.set('rank:thresholds', JSON.stringify(updatedSettings));

    return c.json(updatedSettings);
  } catch (error) {
    console.error('Error updating rank settings:', error);
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});
