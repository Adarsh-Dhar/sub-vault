import { context, reddit, redis } from '@devvit/web/server';
import type {
  RankLevel,
  RankProfile,
  RankThresholdConfig,
  FeedPost,
  LevelUpEvent,
  HeartbeatResponse,
} from '../../shared/rank-types';
import { DEFAULT_THRESHOLDS, LEVEL_NAMES, LEVEL_BADGES } from '../../shared/rank-types';

function getCurrentSubredditName(): string {
  const subredditName = context.subredditName;
  if (!subredditName) {
    throw new Error('Missing subreddit context');
  }
  return subredditName;
}

function getProfileKey(username: string): string {
  return `rank:profile:${username}`;
}

function getSessionKey(username: string): string {
  return `rank:session:${username}`;
}

function getViewedPostsKey(username: string): string {
  return `rank:viewed_posts:${username}`;
}

function getFeedCacheKey(subreddit: string): string {
  return `rank:feed:${subreddit}`;
}

function getLevelUpHistoryKey(subreddit: string): string {
  return `rank:levelups:${subreddit}`;
}

function getLeaderboardKey(subreddit: string): string {
  return `rank:leaderboard:${subreddit}`;
}

function getFeedCacheMetaKey(subreddit: string): string {
  return `rank:feed-meta:${subreddit}`;
}

function normalizeRankSettings(input: Partial<RankThresholdConfig>): RankThresholdConfig {
  return {
    0: { ...DEFAULT_THRESHOLDS[0], ...input[0] },
    1: { ...DEFAULT_THRESHOLDS[1], ...input[1] },
    2: { ...DEFAULT_THRESHOLDS[2], ...input[2] },
    3: { ...DEFAULT_THRESHOLDS[3], ...input[3] },
    4: { ...DEFAULT_THRESHOLDS[4], ...input[4] },
  };
}

async function getAccountCreatedAt(username: string): Promise<number> {
  try {
    const user = await reddit.getUserByUsername(username);
    if (!user || !user.createdAt || !(user.createdAt instanceof Date)) {
      return Date.now();
    }

    return user.createdAt.getTime();
  } catch (error) {
    console.error('Failed to get account creation time:', error);
    return Date.now();
  }
}

async function hydrateProfile(profile: RankProfile): Promise<RankProfile> {
  if (!profile.accountCreatedAt) {
    profile.accountCreatedAt = await getAccountCreatedAt(profile.username);
    await updateProfile(profile);
  }

  return profile;
}

/**
 * Get or create a user's ranking profile
 */
export async function getOrCreateProfile(username: string): Promise<RankProfile> {
  const key = getProfileKey(username);
  const existing = await redis.get(key);

  if (existing) {
    const profile = JSON.parse(existing) as RankProfile;
    return hydrateProfile(profile);
  }

  const accountCreatedAt = await getAccountCreatedAt(username);

  const profile: RankProfile = {
    username,
    level: 0,
    xp: 0,
    hubSeconds: 0,
    postsViewed: 0,
    commentsCount: 0,
    lastSeen: Date.now(),
    joinedAt: Date.now(),
    accountCreatedAt,
    flairAssigned: 0,
  };

  await redis.set(key, JSON.stringify(profile));
  return profile;
}

/**
 * Get user profile (throws if not found)
 */
export async function getProfile(username: string): Promise<RankProfile> {
  const key = getProfileKey(username);
  const data = await redis.get(key);

  if (!data) {
    throw new Error(`Profile not found for user ${username}`);
  }

  return hydrateProfile(JSON.parse(data) as RankProfile);
}

/**
 * Update profile in Redis
 */
export async function updateProfile(profile: RankProfile): Promise<void> {
  const key = getProfileKey(profile.username);
  await redis.set(key, JSON.stringify(profile));
}

/**
 * Add hub seconds via heartbeat (with dedup)
 */
export async function addHeartbeat(username: string): Promise<HeartbeatResponse> {
  const sessionKey = getSessionKey(username);
  const lastHeartbeat = await redis.get(sessionKey);

  // Dedup: if we have a recent heartbeat, don't add seconds
  if (lastHeartbeat) {
    try {
      const sessionState = JSON.parse(lastHeartbeat) as { expiresAt?: number };
      if (sessionState.expiresAt && Date.now() < sessionState.expiresAt) {
        const profile = await getProfile(username);
        return {
          hubSeconds: profile.hubSeconds,
          leveledUp: false,
        };
      }
    } catch {
      // Treat malformed session data as expired and overwrite it.
    }
  }

  // Record this heartbeat with a bounded dedup window.
  const expiresAt = Date.now() + 60_000;
  await redis.set(sessionKey, JSON.stringify({ recordedAt: Date.now(), expiresAt }));

  // Add 30 seconds to the profile
  const profile = await getProfile(username);
  profile.hubSeconds += 30;
  profile.lastSeen = Date.now();
  await updateProfile(profile);

  // Check if level-up occurred
  const levelUpResult = await checkLevelUp(username);

  return {
    hubSeconds: profile.hubSeconds,
    leveledUp: levelUpResult.leveledUp,
    newLevel: levelUpResult.newLevel,
    flairAssigned: levelUpResult.flairAssigned,
  };
}

/**
 * Track a post view (deduped via JSON array of unique postIds)
 */
export async function trackPostView(username: string, postId: string): Promise<number> {
  const key = getViewedPostsKey(username);

  // Get existing viewed posts
  const existingJson = await redis.get(key);
  let viewedPosts: string[] = [];

  if (existingJson) {
    try {
      viewedPosts = JSON.parse(existingJson);
    } catch {
      viewedPosts = [];
    }
  }

  // Add if not already present
  if (!viewedPosts.includes(postId)) {
    viewedPosts.push(postId);
    await redis.set(key, JSON.stringify(viewedPosts));
  }

  // Update profile
  const profile = await getProfile(username);
  profile.postsViewed = viewedPosts.length;
  profile.lastSeen = Date.now();
  await updateProfile(profile);

  return viewedPosts.length;
}

/**
 * Increment comments count
 */
export async function incrementCommentCount(username: string): Promise<number> {
  const profile = await getProfile(username);
  profile.commentsCount += 1;
  profile.lastSeen = Date.now();
  await updateProfile(profile);
  return profile.commentsCount;
}

/**
 * Get thresholds (defaults, can be overridden by settings)
 */
export async function getThresholds(): Promise<RankThresholdConfig> {
  const settingsJson = await redis.get('rank:thresholds');

  if (!settingsJson) {
    return DEFAULT_THRESHOLDS;
  }

  try {
    return normalizeRankSettings(JSON.parse(settingsJson) as Partial<RankThresholdConfig>);
  } catch (error) {
    console.error('Failed to parse rank thresholds:', error);
    return DEFAULT_THRESHOLDS;
  }
}

/**
 * Calculate current level for a user's profile
 */
export async function calculateLevel(profile: RankProfile): Promise<RankLevel> {
  const thresholds = await getThresholds();

  // Check from highest to lowest
  for (let level = 4; level >= 0; level--) {
    const req = thresholds[level as RankLevel];

    // All requirements must be met
    if (
      profile.hubSeconds >= req.hubSeconds &&
      profile.postsViewed >= req.postsViewed &&
      profile.commentsCount >= req.comments
    ) {
      // If this level has an account age requirement, check it
      if (req.accountAgeDays) {
        const accountAgeDays = Math.floor((Date.now() - profile.accountCreatedAt) / (1000 * 60 * 60 * 24));
        if (accountAgeDays < req.accountAgeDays) {
          continue; // Skip this level
        }
      }

      return level as RankLevel;
    }
  }

  return 0;
}

/**
 * Check if user leveled up and assign flair if so
 */
export async function checkLevelUp(
  username: string
): Promise<{ leveledUp: boolean; newLevel?: RankLevel; flairAssigned?: string }> {
  const profile = await getProfile(username);
  const newLevel = await calculateLevel(profile);

  if (newLevel > profile.level) {
    const oldLevel = profile.level;
    profile.level = newLevel;
    profile.flairAssigned = newLevel;
    await updateProfile(profile);

    // Assign flair via Reddit API
    const badge = LEVEL_BADGES[newLevel];
    const levelName = LEVEL_NAMES[newLevel];
    const flairText = `${badge} ${levelName}`;

    try {
      const subreddit = await reddit.getCurrentSubreddit();
      await reddit.setUserFlair({
        subredditName: subreddit.name,
        username,
        text: flairText,
      });
    } catch (error) {
      console.error('Failed to assign flair:', error);
    }

    // Record level-up event
    const event: LevelUpEvent = {
      username,
      oldLevel,
      newLevel,
      badge: flairText,
      timestamp: Date.now(),
    };

    const historyKey = getLevelUpHistoryKey(getCurrentSubredditName());
    const historyJson = await redis.get(historyKey);
    const history: LevelUpEvent[] = historyJson ? JSON.parse(historyJson) : [];
    history.unshift(event);
    await redis.set(historyKey, JSON.stringify(history.slice(0, 100))); // Keep last 100

    // Update leaderboard
    const leaderboardKey = getLeaderboardKey(getCurrentSubredditName());
    const leaderboardJson = await redis.get(leaderboardKey);
    const leaderboard: Record<string, RankLevel> = leaderboardJson ? JSON.parse(leaderboardJson) : {};
    leaderboard[username] = newLevel;
    await redis.set(leaderboardKey, JSON.stringify(leaderboard));

    return {
      leveledUp: true,
      newLevel,
      flairAssigned: flairText,
    };
  }

  return { leveledUp: false };
}

/**
 * Get user progress toward next level
 */
export async function getProgressToNextLevel(
  username: string
): Promise<{
  current: number;
  target: number;
  percentage: number;
  hubSeconds: { current: number; target: number };
  postsViewed: { current: number; target: number };
  comments: { current: number; target: number };
}> {
  const profile = await getProfile(username);
  const thresholds = await getThresholds();

  const currentLevel = profile.level;
  const nextLevel = Math.min(4, currentLevel + 1) as RankLevel;
  const nextReqs = thresholds[nextLevel];

  const progress = {
    current: currentLevel,
    target: nextLevel,
    percentage: 0,
    hubSeconds: {
      current: profile.hubSeconds,
      target: nextReqs.hubSeconds,
    },
    postsViewed: {
      current: profile.postsViewed,
      target: nextReqs.postsViewed,
    },
    comments: {
      current: profile.commentsCount,
      target: nextReqs.comments,
    },
  };

  // Calculate simple percentage (weighted average of three requirements)
  const hubPct = nextReqs.hubSeconds > 0 ? profile.hubSeconds / nextReqs.hubSeconds : 1;
  const postsPct = nextReqs.postsViewed > 0 ? profile.postsViewed / nextReqs.postsViewed : 1;
  const commentsPct = nextReqs.comments > 0 ? profile.commentsCount / nextReqs.comments : 1;

  progress.percentage = Math.min(100, Math.round(((hubPct + postsPct + commentsPct) / 3) * 100));

  return progress;
}

/**
 * Sync comments count from Reddit (call periodically)
 */
export async function syncCommentCount(username: string): Promise<number> {
  try {
    const commentsIterator = reddit.getCommentsByUser({ username, limit: 100, sort: 'new' });
    let commentCount = 0;
    for await (const _ of commentsIterator) {
      commentCount++;
    }

    const profile = await getProfile(username);
    profile.commentsCount = commentCount;
    await updateProfile(profile);

    return commentCount;
  } catch (error) {
    console.error('Failed to sync comment count:', error);
    return 0;
  }
}

/**
 * Get subreddit feed (hot posts) with caching
 */
export async function getFeed(): Promise<FeedPost[]> {
  const subreddit = await reddit.getCurrentSubreddit();
  const cacheKey = getFeedCacheKey(getCurrentSubredditName());
  const cacheMetaKey = getFeedCacheMetaKey(getCurrentSubredditName());

  // Try cache first
  const cached = await redis.get(cacheKey);
  const cachedMeta = await redis.get(cacheMetaKey);
  if (cached && cachedMeta) {
    try {
      const expiresAt = Number(cachedMeta);
      if (Number.isFinite(expiresAt) && Date.now() < expiresAt) {
        return JSON.parse(cached) as FeedPost[];
      }
    } catch {
      // Fall through to refetch when cache metadata is malformed.
    }
  }

  // Fetch from Reddit
  try {
    const postsIter = subreddit.getTopPosts({ timeframe: 'hour', limit: 20, pageSize: 20 });

    const feedPosts: FeedPost[] = [];
    for await (const post of postsIter) {
      feedPosts.push({
        id: post.id,
        title: post.title,
        score: post.score,
        commentCount: post.numberOfComments,
        thumbnail: undefined, // Devvit Post API doesn't provide preview/thumbnail
        author: post.authorName ?? 'deleted',
        subreddit: post.subredditName,
        created: post.createdAt.getTime(),
      });
    }

    // Cache for 5 minutes using a separate expiry marker.
    const expiresAt = Date.now() + 5 * 60 * 1000;
    await redis.set(cacheKey, JSON.stringify(feedPosts));
    await redis.set(cacheMetaKey, expiresAt.toString());

    return feedPosts;
  } catch (error) {
    console.error('Failed to fetch feed:', error);
    return [];
  }
}

/**
 * Get leaderboard (top-ranked users)
 */
export async function getLeaderboard(limit: number = 10): Promise<Array<{ username: string; level: RankLevel }>> {
  const leaderboardKey = getLeaderboardKey(getCurrentSubredditName());

  try {
    const leaderboardJson = await redis.get(leaderboardKey);
    const leaderboard: Record<string, RankLevel> = leaderboardJson ? JSON.parse(leaderboardJson) : {};
    
    return Object.entries(leaderboard)
      .map(([username, level]) => ({ username, level }))
      .sort((a, b) => b.level - a.level)
      .slice(0, limit);
  } catch (error) {
    console.error('Failed to get leaderboard:', error);
    return [];
  }
}

/**
 * Get recent level-up events
 */
export async function getLevelUpHistory(limit: number = 10): Promise<LevelUpEvent[]> {
  const historyKey = getLevelUpHistoryKey(getCurrentSubredditName());

  try {
    const historyJson = await redis.get(historyKey);
    const history: LevelUpEvent[] = historyJson ? JSON.parse(historyJson) : [];
    return history.slice(0, limit);
  } catch (error) {
    console.error('Failed to get level-up history:', error);
    return [];
  }
}

/**
 * Get user's total karma from Reddit API
 */
export async function getUserKarma(username: string): Promise<number> {
  try {
    const user = await reddit.getUserByUsername(username);
    if (!user) return 0;
    return (user.linkKarma ?? 0) + (user.commentKarma ?? 0);
  } catch (error) {
    console.error('Failed to get user karma:', error);
    return 0;
  }
}

/**
 * Get user's account age in days
 */
export async function getUserAccountAge(username: string): Promise<number> {
  try {
    const accountCreatedAt = await getAccountCreatedAt(username);
    return Math.floor((Date.now() - accountCreatedAt) / (1000 * 60 * 60 * 24));
  } catch (error) {
    console.error('Failed to get account age:', error);
    return 0;
  }
}
