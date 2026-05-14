/**
 * Shared types for the ranking system
 */

export type RankLevel = 0 | 1 | 2 | 3 | 4;

export const LEVEL_NAMES: Record<RankLevel, string> = {
  0: "Newcomer",
  1: "Verified",
  2: "Silver",
  3: "Gold",
  4: "Platinum",
};

export const LEVEL_BADGES: Record<RankLevel, string> = {
  0: "🔒",
  1: "✅",
  2: "🥈",
  3: "🥇",
  4: "💎",
};

export interface RankRequirements {
  hubSeconds: number;
  postsViewed: number;
  comments: number;
  accountAgeDays?: number; // optional, only for levels 2-4
}

export interface RankLevelThresholds {
  level: RankLevel;
  badge: string;
  name: string;
  requirements: RankRequirements;
}

export type RankThresholdConfig = Record<RankLevel, RankRequirements>;

/**
 * User's ranking profile stored in Redis
 */
export interface RankProfile {
  username: string;
  level: RankLevel;
  xp: number; // total XP for display
  hubSeconds: number; // total time in the webview
  postsViewed: number; // cards tapped in hub feed
  commentsCount: number;
  lastSeen: number; // timestamp
  joinedAt: number; // timestamp
  flairAssigned: RankLevel;
}

/**
 * Default level thresholds
 * Can be overridden via ModSettingsModal
 */
export const DEFAULT_THRESHOLDS: RankThresholdConfig = {
  0: {
    hubSeconds: 0,
    postsViewed: 0,
    comments: 0,
  },
  1: {
    hubSeconds: 10 * 60, // 10 min
    postsViewed: 10,
    comments: 1,
  },
  2: {
    hubSeconds: 30 * 60, // 30 min
    postsViewed: 20,
    comments: 5,
    accountAgeDays: 14,
  },
  3: {
    hubSeconds: 2 * 60 * 60, // 2 hours
    postsViewed: 50,
    comments: 20,
    accountAgeDays: 30,
  },
  4: {
    hubSeconds: 5 * 60 * 60, // 5 hours
    postsViewed: 100,
    comments: 50,
    // No account age for level 4, karma check instead
  },
};

export interface FeedPost {
  id: string;
  title: string;
  score: number;
  commentCount: number;
  thumbnail?: string;
  author: string;
  subreddit: string;
  created: number;
}

export interface HeartbeatResponse {
  hubSeconds: number; // for live UI timer
  leveledUp: boolean;
  newLevel?: RankLevel;
  flairAssigned?: string;
}

export interface LevelUpEvent {
  username: string;
  oldLevel: RankLevel;
  newLevel: RankLevel;
  badge: string;
  timestamp: number;
}

export interface ProgressRequirement {
  label: string;
  icon: string;
  current: number;
  target: number;
  unit: string;
}

export interface UserStats {
  username: string;
  level: RankLevel;
  xp: number;
  hubSeconds: number;
  postsViewed: number;
  commentsCount: number;
  totalKarma: number;
  accountAge: number; // days
}
