export interface CommitSnapshot {
  id: string;
  author: string;
  hash: string;
  message: string;
  timestamp: Date;
  changes: number;
  status: 'success' | 'warning' | 'error';
  hasData?: boolean;
}

export interface Diff {
  type: 'add' | 'remove' | 'modify';
  file: string;
  additions: number;
  deletions: number;
  content?: string;
}

export interface SubVaultMetrics {
  totalSnapshots: number;
  activeSubscriptions: number;
  successRate: number;
}

// Community Snapshot Data Types
export type CommunityIdentity = {
  displayName: string;
  title: string;
  description: string;
  publicDescription: string;
  subredditType: string;
  nsfw: boolean;
  subscribers: number;
  createdAt: string;
  url: string;
  lang: string;
  allowGalleries: boolean | null;
  allowImages: boolean | null;
  allowVideos: boolean | null;
  allowPolls: boolean | null;
  communityIcon: string;
  bannerBackgroundImage: string;
  bannerImg: string;
  keyColor: string;
  primaryColor: string;
  iconColor: string;
};

export type FlairTemplate = {
  id: string;
  text: string;
  backgroundColor?: string;
  textColor?: string;
  textEditable?: boolean;
  modOnly?: boolean;
  maxEmojis?: number;
};

export type Rule = {
  name: string;
  description: string;
  priority: number;
};

export type RemovalReason = {
  id: string;
  title: string;
  message: string;
};

export type Widget = {
  id: string;
  name: string;
  type: string;
};

export type UserRecord = {
  username: string;
  note?: string;
  permissions?: string[];
};

export type UserManagement = {
  banned: UserRecord[];
  muted: UserRecord[];
  approved: UserRecord[];
  moderators: UserRecord[];
};

export type CommunityLimitations = {
  cssStylesheet: string;
  emojis: string;
  chatChannels: string;
  modNotes: string;
  safetyFilters: string;
  banEventsHistory: string;
};

export type CommunitySnapshotData = {
  identity: CommunityIdentity | null;
  settings: Record<string, unknown> | null;
  rules: Rule[];
  removalReasons: RemovalReason[];
  flairs: {
    post: FlairTemplate[];
    user: FlairTemplate[];
  };
  widgets: Widget[] | null;
  automoderator: string;
  wikiPages: string[];
  userManagement: UserManagement;
  capturedAt: string;
  limitations: CommunityLimitations;
};

export type SnapshotDetail = CommitSnapshot & {
  data?: CommunitySnapshotData;
};
