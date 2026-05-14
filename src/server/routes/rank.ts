/**
 * Ranking system API endpoints
 */

import { Hono } from 'hono';
import { reddit } from '@devvit/web/server';
import {
  getOrCreateProfile,
  getProfile,
  addHeartbeat,
  trackPostView,
  incrementCommentCount,
  checkLevelUp,
  getProgressToNextLevel,
  syncCommentCount,
  getFeed,
  getLeaderboard,
  getLevelUpHistory,
  getUserKarma,
  getUserAccountAge,
} from '../services/rank.service';

export const rank = new Hono();

/**
 * GET /api/rank/:username
 * Fetch user's full rank profile and progress to next level
 */
rank.get('/:username', async (c) => {
  const username = c.req.param('username');

  try {
    const profile = await getOrCreateProfile(username);
    const progress = await getProgressToNextLevel(username);
    const karma = await getUserKarma(username);
    const accountAge = await getUserAccountAge(username);

    return c.json({
      status: 'success',
      profile,
      progress,
      userStats: {
        totalKarma: karma,
        accountAge,
      },
    });
  } catch (error) {
    console.error('Error fetching rank profile:', error);
    return c.json({ status: 'error', message: 'Failed to fetch profile' }, 500);
  }
});

/**
 * GET /api/rank/init
 * Initialize and fetch current user's profile on app load
 */
rank.get('/init', async (c) => {
  try {
    const username = await reddit.getCurrentUsername();

    if (!username) {
      return c.json({ status: 'error', message: 'User not authenticated' }, 401);
    }

    const profile = await getOrCreateProfile(username);
    const progress = await getProgressToNextLevel(username);
    const karma = await getUserKarma(username);
    const accountAge = await getUserAccountAge(username);

    return c.json({
      status: 'success',
      profile,
      progress,
      userStats: {
        totalKarma: karma,
        accountAge,
      },
    });
  } catch (error) {
    console.error('Error in init:', error);
    return c.json({ status: 'error', message: 'Failed to initialize' }, 500);
  }
});

/**
 * GET /api/rank/current-user
 * Get current user's profile and progress
 */
rank.get('/current-user', async (c) => {
  try {
    const username = await reddit.getCurrentUsername();

    if (!username) {
      return c.json({ status: 'error', message: 'User not authenticated' }, 401);
    }

    const profile = await getProfile(username);
    const progress = await getProgressToNextLevel(username);

    return c.json({
      status: 'success',
      profile,
      progress,
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    return c.json({ status: 'error', message: 'Failed to fetch profile' }, 500);
  }
});

/**
 * POST /api/rank/heartbeat
 * Called every 30s by the webview to track time spent in hub
 * Deduped by session key with 60s TTL
 */
rank.post('/heartbeat', async (c) => {
  try {
    const username = await reddit.getCurrentUsername();

    if (!username) {
      return c.json({ status: 'error', message: 'User not authenticated' }, 401);
    }

    const response = await addHeartbeat(username);

    return c.json({
      status: 'success',
      ...response,
    });
  } catch (error) {
    console.error('Error processing heartbeat:', error);
    return c.json({ status: 'error', message: 'Failed to process heartbeat' }, 500);
  }
});

/**
 * POST /api/rank/view-post
 * Called when user taps a post card in the feed
 * Body: { postId: string }
 * Deduped by Redis Set (same postId never counts twice per user)
 */
rank.post('/view-post', async (c) => {
  try {
    const username = await reddit.getCurrentUsername();

    if (!username) {
      return c.json({ status: 'error', message: 'User not authenticated' }, 401);
    }

    const { postId } = await c.req.json<{ postId: string }>();

    if (!postId) {
      return c.json({ status: 'error', message: 'postId is required' }, 400);
    }

    const count = await trackPostView(username, postId);

    return c.json({
      status: 'success',
      postsViewed: count,
    });
  } catch (error) {
    console.error('Error tracking post view:', error);
    return c.json({ status: 'error', message: 'Failed to track post view' }, 500);
  }
});

/**
 * POST /api/rank/sync-comments
 * Syncs comment count from Reddit API
 * Called on hub load and periodically
 */
rank.post('/sync-comments', async (c) => {
  try {
    const username = await reddit.getCurrentUsername();

    if (!username) {
      return c.json({ status: 'error', message: 'User not authenticated' }, 401);
    }

    const count = await syncCommentCount(username);

    return c.json({
      status: 'success',
      commentsCount: count,
    });
  } catch (error) {
    console.error('Error syncing comments:', error);
    return c.json({ status: 'error', message: 'Failed to sync comments' }, 500);
  }
});

/**
 * POST /api/rank/check-level-up
 * Recalculates level from current profile stats
 * Assigns flair if level changed
 */
rank.post('/check-level-up', async (c) => {
  try {
    const username = await reddit.getCurrentUsername();

    if (!username) {
      return c.json({ status: 'error', message: 'User not authenticated' }, 401);
    }

    const result = await checkLevelUp(username);
    const profile = await getProfile(username);

    return c.json({
      status: 'success',
      leveledUp: result.leveledUp,
      newLevel: result.newLevel,
      flairAssigned: result.flairAssigned,
      currentProfile: profile,
    });
  } catch (error) {
    console.error('Error checking level-up:', error);
    return c.json({ status: 'error', message: 'Failed to check level-up' }, 500);
  }
});

/**
 * GET /api/rank/feed?cursor=X
 * Get paginated subreddit hot posts
 * Cached for 5 minutes
 */
rank.get('/feed', async (c) => {
  try {
    const posts = await getFeed();

    return c.json({
      status: 'success',
      posts,
      cursor: posts.length > 0 ? (posts[posts.length - 1]?.id ?? null) : null,
    });
  } catch (error) {
    console.error('Error fetching feed:', error);
    return c.json({ status: 'error', message: 'Failed to fetch feed' }, 500);
  }
});

/**
 * GET /api/rank/leaderboard?limit=10
 * Get top-ranked users in the subreddit
 */
rank.get('/leaderboard', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') ?? '10');

    const leaderboard = await getLeaderboard(limit);

    return c.json({
      status: 'success',
      leaderboard,
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return c.json({ status: 'error', message: 'Failed to fetch leaderboard' }, 500);
  }
});

/**
 * GET /api/rank/history?limit=10
 * Get recent level-up events
 */
rank.get('/history', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') ?? '10');

    const history = await getLevelUpHistory(limit);

    return c.json({
      status: 'success',
      history,
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    return c.json({ status: 'error', message: 'Failed to fetch history' }, 500);
  }
});

/**
 * POST /api/rank/comment
 * Manually increment comment count (called by trigger, not by client)
 */
rank.post('/comment', async (c) => {
  try {
    const { username } = await c.req.json<{ username: string }>();

    if (!username) {
      return c.json({ status: 'error', message: 'username is required' }, 400);
    }

    const count = await incrementCommentCount(username);
    const levelUp = await checkLevelUp(username);

    return c.json({
      status: 'success',
      commentsCount: count,
      leveledUp: levelUp.leveledUp,
      newLevel: levelUp.newLevel,
    });
  } catch (error) {
    console.error('Error incrementing comment count:', error);
    return c.json({ status: 'error', message: 'Failed to increment comment count' }, 500);
  }
});
