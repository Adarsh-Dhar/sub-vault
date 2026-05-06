export interface CommitSnapshot {
  id: string;
  author: string;
  hash: string;
  message: string;
  timestamp: Date;
  changes: number;
  status: 'success' | 'warning' | 'error';
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
