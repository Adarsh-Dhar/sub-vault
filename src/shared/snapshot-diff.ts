/**
 * src/shared/snapshot-diff.ts
 *
 * Computes a human-readable diff between two SubVault snapshot payloads.
 * Works in both server (Node) and browser (no Node-only imports).
 */

export type DiffLine =
  | { kind: 'added'; text: string }
  | { kind: 'removed'; text: string }
  | { kind: 'context'; text: string };

export type SnapshotDiff = {
  /** Section name, e.g. "rules", "settings", "automoderator" */
  section: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function stable(v: unknown): string {
  return JSON.stringify(v, null, 2) ?? '';
}

/**
 * Minimal line-level diff using LCS (longest-common-subsequence).
 * Returns an array of DiffLine objects.
 */
function lineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText === '' ? [] : oldText.split('\n');
  const newLines = newText === '' ? [] : newText.split('\n');

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = oldLines[i - 1]! === newLines[j - 1]!
        ? dp[i - 1]![j - 1]! + 1
        : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }

  // Backtrack
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ kind: 'context', text: oldLines[i - 1]! });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      result.unshift({ kind: 'added', text: newLines[j - 1]! });
      j--;
    } else {
      result.unshift({ kind: 'removed', text: oldLines[i - 1]! });
      i--;
    }
  }
  return result;
}

/** Keep only lines near changes (±3 context lines) */
function compactLines(lines: DiffLine[], ctx = 3): DiffLine[] {
  if (lines.every(l => l.kind === 'context')) return [];

  const keep = new Set<number>();
  lines.forEach((l, idx) => {
    if (l.kind !== 'context') {
      for (let k = Math.max(0, idx - ctx); k <= Math.min(lines.length - 1, idx + ctx); k++) {
        keep.add(k);
      }
    }
  });

  const result: DiffLine[] = [];
  let skipping = false;
  lines.forEach((l, idx) => {
    if (keep.has(idx)) {
      skipping = false;
      result.push(l);
    } else if (!skipping) {
      result.push({ kind: 'context', text: '...' });
      skipping = true;
    }
  });
  return result;
}

// ─── section extractors ───────────────────────────────────────────────────────

type SnapshotData = Record<string, unknown>;

const SECTIONS: Array<{
  key: string;
  label: string;
  extract: (d: SnapshotData) => unknown;
}> = [
  {
    key: 'identity',
    label: 'Identity',
    extract: d => d['identity'],
  },
  {
    key: 'rules',
    label: 'Rules',
    extract: d => d['rules'],
  },
  {
    key: 'settings',
    label: 'Community Settings',
    extract: d => {
      const s = d['settings'] as Record<string, unknown> | null | undefined;
      if (!s) return null;
      const RELEVANT = [
        'title', 'description', 'publicDescription', 'subredditType', 'nsfw', 'lang',
        'isPostingRestricted', 'isCommentingRestricted', 'isCrosspostingAllowed',
        'isArchivePostsEnabled', 'isDiscoveryAllowed', 'isSpoilerAvailable',
        'isChatPostCreationAllowed', 'isChatPostFeatureEnabled', 'isEmojisEnabled',
        'isPredictionAllowed', 'isPredictionsTournamentAllowed', 'isPredictionContributorsAllowed',
        'allAllowedPostTypes', 'allowedPostCapabilities', 'allowedMediaInComments',
        'authorFlairEnabled', 'authorFlairSelfAssignable',
        'postFlairEnabled', 'postFlairSelfAssignable', 'wikiEditMode',
      ];
      return Object.fromEntries(RELEVANT.map(k => [k, s[k] ?? null]));
    },
  },
  {
    key: 'appearance',
    label: 'Appearance / Theme',
    extract: d => {
      const raw = d['settings'] as Record<string, unknown> | null | undefined;
      if (!raw) return null;
      // Track ONLY the keys we can update via Devvit API
      const APPEARANCE_KEYS = [
        'keyColor', 'primaryColor', 'headerTitle', 'bannerBackgroundColor'
      ];
      return Object.fromEntries(APPEARANCE_KEYS.map(k => [k, raw[k] ?? null]));
    },
  },
  {
    key: 'advancedTheme',
    label: 'Advanced Theme (Read-Only)',
    extract: d => {
      const raw = d['settings'] as Record<string, unknown> | null | undefined;
      if (!raw) return null;
      // These keys cannot be updated by Devvit, so we separate them to avoid timeouts
      const READ_ONLY_KEYS = ['backgroundColor', 'highlightColor'];
      return Object.fromEntries(READ_ONLY_KEYS.map(k => [k, raw[k] ?? null]));
    },
  },
  {
    key: 'automoderator',
    label: 'AutoModerator',
    extract: d => d['automoderator'],
  },
  {
    key: 'removalReasons',
    label: 'Removal Reasons',
    extract: d => d['removalReasons'],
  },
  {
    key: 'postFlairs',
    label: 'Post Flairs',
    extract: d => (d['flairs'] as Record<string, unknown> | undefined)?.['post'] ?? d['postFlairs'],
  },
  {
    key: 'userFlairs',
    label: 'User Flairs',
    extract: d => (d['flairs'] as Record<string, unknown> | undefined)?.['user'] ?? d['userFlairs'],
  },
  {
    key: 'widgets',
    label: 'Widgets',
    extract: d => d['widgets'],
  },
  {
    key: 'wikiPages',
    label: 'Wiki Pages',
    extract: d => d['wikiPages'],
  },
  {
    key: 'userManagement',
    label: 'User Management',
    extract: d => d['userManagement'],
  },
];

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Compare two snapshot `data` payloads and return per-section diffs.
 * Sections with no changes are omitted.
 */
export function computeSnapshotDiff(
  oldData: SnapshotData | null | undefined,
  newData: SnapshotData | null | undefined,
): SnapshotDiff[] {
  const results: SnapshotDiff[] = [];

  const old_ = oldData ?? {};
  const new_ = newData ?? {};

  for (const { label, extract } of SECTIONS) {
    const oldVal = stable(extract(old_));
    const newVal = stable(extract(new_));

    if (oldVal === newVal) continue;

    const rawLines = lineDiff(oldVal, newVal);
    const lines = compactLines(rawLines);

    const additions = rawLines.filter(l => l.kind === 'added').length;
    const deletions = rawLines.filter(l => l.kind === 'removed').length;

    if (additions === 0 && deletions === 0) continue;

    results.push({ section: label, additions, deletions, lines });
  }

  // If nothing matched the known sections, do a catch-all on the whole data blob
  if (results.length === 0) {
    const oldAll = stable(old_);
    const newAll = stable(new_);
    if (oldAll !== newAll) {
      const rawLines = lineDiff(oldAll, newAll);
      const lines = compactLines(rawLines);
      results.push({
        section: 'Changes',
        additions: rawLines.filter(l => l.kind === 'added').length,
        deletions: rawLines.filter(l => l.kind === 'removed').length,
        lines,
      });
    }
  }

  return results;
}

/** Convenience: build a summary string like "3 sections changed (+12 -5)" */
export function diffSummary(diffs: SnapshotDiff[]): string {
  const totalAdd = diffs.reduce((s, d) => s + d.additions, 0);
  const totalDel = diffs.reduce((s, d) => s + d.deletions, 0);
  return `${diffs.length} section${diffs.length !== 1 ? 's' : ''} changed (+${totalAdd} -${totalDel})`;
}