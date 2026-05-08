import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import { computeSnapshotDiff } from '../../shared/snapshot-diff';

export const snapshot = new Hono();

type SnapshotListItem = {
  id: string;
  author: string;
  hash: string;
  message: string;
  timestamp: string;
  changes: number;
  status: 'success' | 'warning' | 'error';
};

type StoredSnapshot = {
  id?: string;
  message?: string;
  data?: Record<string, unknown>;
  createdAt?: string;
};

type VerificationSection = {
  section: string;
  additions: number;
  deletions: number;
  status: 'matched' | 'drifted' | 'skipped';
};

type VerificationResult = {
  sectionsChanged: number;
  totalAdditions: number;
  totalDeletions: number;
  sections: VerificationSection[];
  verifiedAt: string;
  verified: boolean;
  notes: string[];
};

type PollingSession = {
  pollingId: string;
  restoreId: string;
  targetId: string;
  subName: string;
  currentAttempt: number;
  maxAttempts: number;
  isActive: boolean;
  verified: boolean;
  timedOut: boolean;
  lastAttemptAt?: string;
  lastVerification?: VerificationResult | null;
  createdAt: string;
  completedAt?: string;
};

const VERIFICATION_POLL_INTERVAL_MS = 10_000;
const VERIFICATION_MAX_ATTEMPTS = 18;
const POLLING_SESSION_TTL_SECONDS = 60 * 30;

function parseStoredSnapshot(raw: string): StoredSnapshot | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const candidate = parsed as Record<string, unknown>;
  const snap: StoredSnapshot = {};

  if (typeof candidate['id'] === 'string') snap.id = candidate['id'];
  if (typeof candidate['message'] === 'string') snap.message = candidate['message'];
  if (typeof candidate['createdAt'] === 'string') snap.createdAt = candidate['createdAt'];
  if (typeof candidate['data'] === 'object' && candidate['data'] !== null) {
    snap.data = candidate['data'] as Record<string, unknown>;
  }

  return snap;
}

function toListItem(parsed: StoredSnapshot): SnapshotListItem {
  const snapshotId = parsed.id ?? 'unknown';
  const message = parsed.message ?? 'Snapshot created';
  const timestampRaw = snapshotId.replace(/\D/g, '');
  const fallbackTimestamp =
    timestampRaw.length > 0
      ? new Date(Number.parseInt(timestampRaw, 10)).toISOString()
      : new Date(0).toISOString();

  let author = 'Manual Commit';
  if (message.startsWith('Restored from:')) {
    author = 'Restore';
  } else {
    const match = message.match(/— by (.+)$/);
    if (match?.[1]) {
      author = match[1];
    }
  }

  return {
    id: snapshotId,
    author,
    hash: timestampRaw.slice(-7),
    message,
    timestamp: parsed.createdAt ?? fallbackTimestamp,
    changes: Object.keys(parsed.data ?? {}).length,
    status: 'success',
  };
}

async function getAllSnapshotsSorted(): Promise<StoredSnapshot[]> {
  const snapshotMap = await redis.hGetAll('snapshot_backups');
  const snapshots: StoredSnapshot[] = [];
  for (const raw of Object.values(snapshotMap)) {
    const parsed = parseStoredSnapshot(raw);
    if (parsed) snapshots.push(parsed);
  }
  snapshots.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
  return snapshots;
}

async function safeFetch<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn('[SubVault] safeFetch fallback:', String(err).slice(0, 120));
    return fallback;
  }
}

async function loadStoredSnapshot(snapshotId: string): Promise<StoredSnapshot | null> {
  let raw = await redis.get(`snapshot:${snapshotId}`);
  if (!raw) {
    const snapshotMap = await redis.hGetAll('snapshot_backups');
    raw = snapshotMap[snapshotId];
  }
  if (!raw) return null;

  return parseStoredSnapshot(raw);
}

function buildVerificationResult(
  targetData: Record<string, unknown>,
  liveData: Record<string, unknown>,
): VerificationResult {
  const diffs = computeSnapshotDiff(targetData, liveData);
  const totalAdditions = diffs.reduce((sum, diff) => sum + diff.additions, 0);
  const totalDeletions = diffs.reduce((sum, diff) => sum + diff.deletions, 0);

  // Only writable sections are part of restore verification.
  const restorableSections = new Set(['Rules', 'AutoModerator', 'Post Flairs', 'User Flairs']);

  const sections: VerificationSection[] = diffs.map(diff => ({
    section: diff.section,
    additions: diff.additions,
    deletions: diff.deletions,
    status: restorableSections.has(diff.section) ? 'drifted' : 'skipped',
  }));

  const realDrift = sections.filter(section => section.status === 'drifted');
  const notes: string[] = [];

  if (realDrift.length === 0) {
    notes.push('All restored sections match the live subreddit — restore verified successfully. ✓');
  } else {
    for (const section of sections) {
      if (section.status === 'drifted') {
        notes.push(
          `${section.section}: live state still differs from snapshot (+${section.additions} / -${section.deletions}). ` +
          'Reddit may need a moment to propagate changes, or the Devvit API had a temporary error.',
        );
      }
    }
  }

  return {
    sectionsChanged: realDrift.length,
    totalAdditions,
    totalDeletions,
    sections,
    verifiedAt: new Date().toISOString(),
    verified: realDrift.length === 0,
    notes,
  };
}

async function saveVerificationSnapshot(
  snapshotId: string,
  message: string,
  data: Record<string, unknown>,
): Promise<void> {
  const payload = JSON.stringify({
    id: snapshotId,
    message,
    data,
    createdAt: new Date().toISOString(),
  });

  await Promise.all([
    redis.set(`snapshot:${snapshotId}`, payload),
    redis.hSet('snapshot_backups', { [snapshotId]: payload }),
  ]);
}

async function readPollingSession(pollingId: string): Promise<PollingSession | null> {
  const raw = await redis.get(`polling:${pollingId}`);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PollingSession>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      pollingId: String(parsed.pollingId ?? pollingId),
      restoreId: String(parsed.restoreId ?? ''),
      targetId: String(parsed.targetId ?? ''),
      subName: String(parsed.subName ?? ''),
      currentAttempt: typeof parsed.currentAttempt === 'number' ? parsed.currentAttempt : 0,
      maxAttempts: typeof parsed.maxAttempts === 'number' ? parsed.maxAttempts : VERIFICATION_MAX_ATTEMPTS,
      isActive: parsed.isActive !== false,
      verified: parsed.verified === true,
      timedOut: parsed.timedOut === true,
      lastAttemptAt: typeof parsed.lastAttemptAt === 'string' ? parsed.lastAttemptAt : undefined,
      lastVerification: parsed.lastVerification && typeof parsed.lastVerification === 'object'
        ? (parsed.lastVerification as VerificationResult)
        : undefined,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
      completedAt: typeof parsed.completedAt === 'string' ? parsed.completedAt : undefined,
    };
  } catch {
    return null;
  }
}

async function writePollingSession(session: PollingSession): Promise<void> {
  await redis.set(`polling:${session.pollingId}`, JSON.stringify(session));
  await redis.expire(`polling:${session.pollingId}`, POLLING_SESSION_TTL_SECONDS);
}

const DEFAULT_AUTOMOD_PAGE = 'config/automoderator' as const;
const AUTOMOD_PAGE_CANDIDATES = [DEFAULT_AUTOMOD_PAGE, 'automoderator'] as const;

function normalizePageName(page: string): string {
  return page.trim().toLowerCase();
}

async function ensureWikiReadAccess(subredditName: string): Promise<void> {
  const currentUsername = await safeFetch(() => reddit.getCurrentUsername(), '');
  if (!currentUsername) {
    throw new Error('Unable to determine the current Reddit account for wiki access checks');
  }

  const moderators = await safeFetch(async () => {
    const listing: Array<Record<string, unknown>> = [];
    for await (const mod of reddit.getModerators({ subredditName })) {
      listing.push({ username: mod.username, permissions: (mod as any).permissions ?? [] });
      if (listing.length >= 200) break;
    }
    return listing;
  }, [] as Array<Record<string, unknown>>);

  const moderator = moderators.find(
    mod => String(mod.username ?? '').toLowerCase() === currentUsername.toLowerCase(),
  );

  if (!moderator) {
    throw new Error(`@${currentUsername} is not a moderator of r/${subredditName}`);
  }

  const permissions = Array.isArray(moderator.permissions)
    ? moderator.permissions.map(permission => String(permission))
    : [];

  console.log(
    `[SubVault] Permission check for @${currentUsername} - permissions array:`,
    JSON.stringify(permissions),
  );

  const hasWikiPermission = permissions.includes('wiki');
  const hasAllPermissions =
    permissions.length === 0 ||
    permissions.includes('all') ||
    permissions.includes('everything') ||
    permissions.includes('*');

  if (!hasWikiPermission && !hasAllPermissions) {
    throw new Error(`@${currentUsername} needs the wiki moderator permission for r/${subredditName}`);
  }
}

function resolveAutomodPageName(wikiPages: unknown): string | null {
  const pages = Array.isArray(wikiPages) ? wikiPages.map(page => String(page)) : [];
  const normalizedPages = new Map(pages.map(page => [normalizePageName(page), page] as const));

  for (const candidate of AUTOMOD_PAGE_CANDIDATES) {
    const resolved = normalizedPages.get(normalizePageName(candidate));
    if (resolved) return resolved;
  }

  return null;
}

// ─── Capture restorable sections plus read-only metadata ──────────────────────
// Devvit Web provides no write methods for subreddit settings / appearance / widgets.
// We keep those fields in the snapshot for display only, but exclude them from restore.
async function captureNormalizedSnapshot(subName: string): Promise<Record<string, unknown>> {
  const [
    subredditInfo,
    rules,
    postFlairs,
    userFlairs,
    subredditStyles,
  ] = await Promise.all([
    safeFetch(() => reddit.getSubredditInfoByName(subName), null),
    safeFetch(() => reddit.getRules(subName), []),
    safeFetch(() => reddit.getPostFlairTemplates(subName), []),
    safeFetch(() => reddit.getUserFlairTemplates(subName), []),
    safeFetch(() => reddit.getSubredditStyles(context.subredditId), null),
  ]);

  let automoderator = 'Not configured';
  try {
    await ensureWikiReadAccess(subName);
    const wikiPages = await safeFetch(() => reddit.getWikiPages(subName), []);
    const resolvedPage = resolveAutomodPageName(wikiPages) ?? DEFAULT_AUTOMOD_PAGE;
    const wiki = await reddit.getWikiPage(subName, resolvedPage);
    automoderator = wiki.content;
    console.log('[SubVault] Automod config captured:', automoderator.length, 'characters from', resolvedPage);
  } catch (err) {
    const errMsg = String(err);
    if (errMsg.includes('wiki moderator permission')) {
      throw err;
    }
    if (errMsg.includes('404') || errMsg.includes('Not Found')) {
      console.log('[SubVault] Automod not configured (404)');
    } else {
      console.warn('[SubVault] Warning: Failed to fetch automod config:', errMsg.slice(0, 150));
    }
  }

  const normalizedRules = (rules as any[]).map((r: any, i: number) => ({
    shortName: r.shortName ?? r.name ?? `Rule ${i + 1}`,
    description: r.description ?? '',
    violationReason: r.violationReason ?? r.shortName ?? r.name ?? '',
    kind: r.kind ?? 'all',
    priority: r.priority ?? i,
  }));

  const normalizedPostFlairs = (postFlairs as any[]).map((f: any) => ({
    id: f.id ?? '',
    text: f.text ?? '',
    textColor: f.textColor ?? 'dark',
    backgroundColor: f.backgroundColor ?? '',
    textEditable: f.textEditable ?? false,
    modOnly: f.modOnly ?? false,
  }));

  const normalizedUserFlairs = (userFlairs as any[]).map((f: any) => ({
    id: f.id ?? '',
    text: f.text ?? '',
    textColor: f.textColor ?? 'dark',
    backgroundColor: f.backgroundColor ?? '',
    textEditable: f.textEditable ?? false,
    modOnly: f.modOnly ?? false,
  }));

  const info = subredditInfo as any;
  const styleSettings = subredditStyles && typeof subredditStyles === 'object'
    ? (subredditStyles as Record<string, unknown>)
    : {};
  const communitySettings: Record<string, unknown> = {
    ...styleSettings,
    title: info?.title ?? '',
    description: info?.description ?? '',
    publicDescription: info?.publicDescription ?? '',
    subredditType: info?.subredditType ?? info?.type ?? '',
    nsfw: typeof info?.over18 === 'boolean' ? info.over18 : (info?.nsfw ?? false),
    lang: info?.lang ?? 'en',
    allowGalleries: info?.allowGalleries ?? null,
    allowImages: info?.allowImages ?? null,
    allowVideos: info?.allowVideos ?? null,
    allowPolls: info?.allowPolls ?? null,
  };

  return {
    identity: info ? {
      displayName: info.name ?? subName,
      title: info.title ?? '',
      description: info.description ?? '',
      publicDescription: info.publicDescription ?? '',
      subredditType: info.subredditType ?? info.type ?? '',
      nsfw: typeof info.over18 === 'boolean' ? info.over18 : (info.nsfw ?? false),
      subscribers: info.subscribers ?? 0,
      createdAt: info.createdAt ?? '',
      url: info.url ?? '',
      lang: info.lang ?? 'en',
      allowGalleries: info.allowGalleries ?? null,
      allowImages: info.allowImages ?? null,
      allowVideos: info.allowVideos ?? null,
      allowPolls: info.allowPolls ?? null,
      communityIcon: info.communityIcon ?? '',
      bannerBackgroundImage: info.bannerBackgroundImage ?? '',
      bannerImg: info.bannerImg ?? '',
      keyColor: info.keyColor ?? '',
      primaryColor: info.primaryColor ?? '',
      iconColor: info.iconColor ?? '',
    } : null,
    settings: communitySettings,
    rules: normalizedRules,
    flairs: {
      post: normalizedPostFlairs,
      user: normalizedUserFlairs,
    },
    automoderator,
    wikiPages: [],
    removalReasons: [],
    widgets: null,
    userManagement: {
      banned: [],
      muted: [],
      approved: [],
      moderators: [],
    },
    limitations: {
      cssStylesheet: 'Read-only metadata only',
      emojis: 'Read-only metadata only',
      chatChannels: 'Read-only metadata only',
      modNotes: 'Read-only metadata only',
      safetyFilters: 'Read-only metadata only',
      banEventsHistory: 'Read-only metadata only',
    },
    capturedAt: new Date().toISOString(),
  };
}

// ─── GET /api/snapshot ────────────────────────────────────────────────────────
snapshot.get('/', async (c) => {
  try {
    const snapshotMap = await redis.hGetAll('snapshot_backups');
    const snapshotsRaw = Object.values(snapshotMap);
    if (snapshotsRaw.length === 0) return c.json([]);

    const snapshots: SnapshotListItem[] = [];
    for (const raw of snapshotsRaw) {
      try {
        const parsed = parseStoredSnapshot(raw);
        if (parsed) snapshots.push(toListItem(parsed));
      } catch (err) {
        console.error('[SubVault] Failed to parse snapshot:', err);
      }
    }
    snapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return c.json(snapshots);
  } catch (err) {
    console.error('[SubVault] Failed to fetch snapshots:', err);
    return c.json({ error: 'Failed to fetch snapshots' }, 500);
  }
});

// ─── POST /api/snapshot ───────────────────────────────────────────────────────
snapshot.post('/', async (c) => {
  try {
    const body = await c.req.json<{ message?: string; description?: string }>();
    let message =
      typeof body.message === 'string' && body.message.trim()
        ? body.message.trim()
        : 'Manual snapshot';

    const subName = context.subredditName;
    if (!subName) return c.json({ error: 'Missing subreddit context' }, 400);

    const creator = await safeFetch(() => reddit.getCurrentUsername(), 'UnknownMod');
    message = `${message} — by ${creator}`;

    const data = await captureNormalizedSnapshot(subName);

    const timestamp = Date.now();
    const id = `manual_${timestamp}`;
    const stored = { id, message, data, createdAt: new Date(timestamp).toISOString() };
    const payload = JSON.stringify(stored);

    await Promise.all([
      redis.set(`snapshot:${id}`, payload),
      redis.hSet('snapshot_backups', { [id]: payload }),
    ]);

    console.log('[SubVault] Manual snapshot saved:', id);

    let author = 'Manual Commit';
    const match = message.match(/— by (.+)$/);
    if (match?.[1]) {
      author = match[1];
    }

    return c.json({
      id,
      author,
      hash: String(timestamp).slice(-7),
      message,
      timestamp: stored.createdAt,
      changes: Object.keys(data).length,
      status: 'success',
    }, 201);
  } catch (err) {
    console.error('[SubVault] Failed to save snapshot:', err);
    return c.json({ error: 'Failed to save snapshot' }, 500);
  }
});

// ─── GET /api/snapshot/:id ────────────────────────────────────────────────────
snapshot.get('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    let raw = await redis.get(`snapshot:${id}`);
    if (!raw) {
      const snapshotMap = await redis.hGetAll('snapshot_backups');
      raw = snapshotMap[id];
    }
    if (!raw) return c.json({ error: 'Snapshot not found' }, 404);

    const parsed = parseStoredSnapshot(raw);
    if (!parsed) return c.json({ error: 'Failed to parse snapshot' }, 500);

    return c.json({ ...toListItem(parsed), data: parsed.data ?? {} });
  } catch (err) {
    console.error('[SubVault] Failed to fetch snapshot details:', err);
    return c.json({ error: 'Failed to fetch snapshot details' }, 500);
  }
});

// ─── GET /api/snapshot/:id/diff ───────────────────────────────────────────────
snapshot.get('/:id/diff', async (c) => {
  const id = c.req.param('id');
  try {
    let currentRaw = await redis.get(`snapshot:${id}`);
    if (!currentRaw) {
      const snapshotMap = await redis.hGetAll('snapshot_backups');
      currentRaw = snapshotMap[id];
    }
    if (!currentRaw) return c.json({ error: 'Snapshot not found' }, 404);

    const currentParsed = parseStoredSnapshot(currentRaw);
    if (!currentParsed) return c.json({ error: 'Failed to parse snapshot' }, 500);

    const allSnapshots = await getAllSnapshotsSorted();
    const currentIndex = allSnapshots.findIndex(s => s.id === id);
    const previousParsed =
      currentIndex >= 0 && currentIndex < allSnapshots.length - 1
        ? allSnapshots[currentIndex + 1]
        : null;

    return c.json({
      current: {
        id: currentParsed.id ?? id,
        message: currentParsed.message ?? '',
        createdAt: currentParsed.createdAt ?? new Date().toISOString(),
        data: currentParsed.data ?? {},
      },
      previous: previousParsed
        ? {
            id: previousParsed.id ?? '',
            message: previousParsed.message ?? '',
            createdAt: previousParsed.createdAt ?? '',
            data: previousParsed.data ?? {},
          }
        : null,
    });
  } catch (err) {
    console.error('[SubVault] Failed to compute diff:', err);
    return c.json({ error: 'Failed to compute diff' }, 500);
  }
});

// ─── GET /api/snapshot/polling-sessions ───────────────────────────────────
snapshot.get('/polling-sessions', async (c) => {
  try {
    // Prefer direct KEYS call if available on the Redis client; otherwise return empty
    const keys: string[] = typeof (redis as any).keys === 'function' ? await (redis as any).keys('polling:*') : [];

    const sessions: PollingSession[] = [];
    for (const key of keys) {
      try {
        const raw = await redis.get(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as PollingSession;
        sessions.push(parsed);
      } catch (err) {
        console.warn('[SubVault] Failed to parse polling session:', String(err).slice(0, 120));
      }
    }

    sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return c.json({ sessions });
  } catch (err) {
    console.error('[SubVault] Failed to list polling sessions:', err);
    return c.json({ error: 'Failed to list polling sessions' }, 500);
  }
});


// ─── GET /api/snapshot/:pollingId/verify-status ──────────────────────────────
snapshot.get('/:pollingId/verify-status', async (c) => {
  const pollingId = c.req.param('pollingId');

  try {
    const session = await readPollingSession(pollingId);
    if (!session) {
      return c.json({ error: 'Polling session not found' }, 404);
    }

    if (session.verified || session.timedOut || !session.isActive) {
      return c.json(session);
    }

    if (session.currentAttempt >= session.maxAttempts) {
      session.isActive = false;
      session.timedOut = true;
      session.completedAt = new Date().toISOString();
      await writePollingSession(session);
      return c.json(session);
    }

    const now = Date.now();
    if (session.lastAttemptAt) {
      const elapsed = now - new Date(session.lastAttemptAt).getTime();
      if (Number.isFinite(elapsed) && elapsed < VERIFICATION_POLL_INTERVAL_MS) {
        return c.json({
          ...session,
          nextPollAfterMs: VERIFICATION_POLL_INTERVAL_MS - elapsed,
        });
      }
    }

    const targetSnapshot = await loadStoredSnapshot(session.targetId);
    if (!targetSnapshot?.data) {
      session.isActive = false;
      session.completedAt = new Date().toISOString();
      session.lastVerification = {
        sectionsChanged: 0,
        totalAdditions: 0,
        totalDeletions: 0,
        sections: [],
        verifiedAt: new Date().toISOString(),
        verified: false,
        notes: ['Target snapshot could not be loaded for verification.'],
      };
      await writePollingSession(session);
      return c.json(session, 500);
    }

    session.currentAttempt += 1;
    session.lastAttemptAt = new Date().toISOString();

    await redis.expire(`restore_in_progress:${session.subName}`, 60);

    const liveData = await captureNormalizedSnapshot(session.subName);
    const verification = buildVerificationResult(targetSnapshot.data, liveData);
    session.lastVerification = verification;

    if (verification.verified) {
      session.isActive = false;
      session.verified = true;
      session.completedAt = new Date().toISOString();
      await saveVerificationSnapshot(
        `verify_${pollingId}`,
        'Verification capture after restore — by SubVault',
        liveData,
      );
      await writePollingSession(session);
      return c.json(session);
    }

    if (session.currentAttempt >= session.maxAttempts) {
      session.isActive = false;
      session.timedOut = true;
      session.completedAt = new Date().toISOString();
      await saveVerificationSnapshot(
        `verify_${pollingId}`,
        'Verification capture after restore — by SubVault',
        liveData,
      );
      await writePollingSession(session);
      return c.json(session, 408);
    }

    await writePollingSession(session);
    return c.json(session);
  } catch (err) {
    console.error('[SubVault] Failed to fetch verification status:', err);
    return c.json({ error: 'Failed to fetch verification status' }, 500);
  }
});

// ─── POST /api/snapshot/:id/restore ──────────────────────────────────────────
snapshot.post('/:id/restore', async (c) => {
  try {
    const body = await c.req.json<{ targetId?: string }>();
    const targetId = body.targetId;
    if (!targetId) return c.json({ error: 'targetId is required' }, 400);

    let targetRaw = await redis.get(`snapshot:${targetId}`);
    if (!targetRaw) {
      const snapshotMap = await redis.hGetAll('snapshot_backups');
      targetRaw = snapshotMap[targetId];
    }
    if (!targetRaw) return c.json({ error: 'Target snapshot not found' }, 404);

    const targetParsed = parseStoredSnapshot(targetRaw);
    if (!targetParsed?.data) return c.json({ error: 'Failed to parse target snapshot' }, 500);

    const subName = context.subredditName;
    if (!subName) return c.json({ error: 'Missing subreddit context' }, 400);

    const d = targetParsed.data;
    const restoreResults: Record<string, { success: boolean; skipped?: boolean; count?: number; error?: string }> = {};

    const attempt = async (name: string, fn: () => Promise<void>) => {
      try {
        await fn();
        console.log(`[SubVault] ✓ ${name} restored`);
      } catch (err) {
        restoreResults[name] = { success: false, error: String(err).slice(0, 200) };
        console.error(`[SubVault] ✗ ${name} failed:`, err);
      }
    };

    const readRules = (): Array<Record<string, unknown>> => {
      const raw = d['rules'];
      if (!Array.isArray(raw)) return [];
      return (raw as any[]).map((r: any, i: number) => ({
        shortName: r.shortName ?? r.name ?? `Rule ${i + 1}`,
        description: r.description ?? '',
        violationReason: r.violationReason ?? r.shortName ?? r.name ?? '',
        kind: r.kind ?? 'all',
        priority: typeof r.priority === 'number' ? r.priority : i,
      }));
    };

    const readFlairs = (kind: 'post' | 'user'): Array<Record<string, unknown>> => {
      const block = d['flairs'] as Record<string, unknown> | undefined;
      const arr = block?.[kind];
      return Array.isArray(arr) ? arr as Array<Record<string, unknown>> : [];
    };

    // ── 1. Rules ──────────────────────────────────────────────────────────────
    await attempt('rules', async () => {
      const snapshotRules = readRules();

      if (snapshotRules.length === 0) {
        restoreResults['rules'] = { success: true, skipped: true };
        return;
      }

      const currentRules = await reddit.getRules(subName);
      const currentRuleNames = new Set(
        currentRules.map((r: any) => (r.shortName ?? '').toLowerCase()),
      );

      const sorted = [...snapshotRules].sort((a, b) => (a['priority'] as number) - (b['priority'] as number));

      let addedCount = 0;
      for (const rule of sorted) {
        const shortName = (rule['shortName'] as string) || 'Rule';
        if (!currentRuleNames.has(shortName.toLowerCase())) {
          await reddit.createRule(subName, {
            shortName,
            description: (rule['description'] as string) ?? '',
            violationReason: (rule['violationReason'] as string) || shortName,
            kind: (rule['kind'] as 'link' | 'comment' | 'all') ?? 'all',
          });
          addedCount++;
        }
      }

      restoreResults['rules'] = {
        success: true,
        count: addedCount,
        error:
          addedCount < snapshotRules.length
            ? 'Devvit cannot delete old rules. Missing rules were added, but removed rules must be deleted manually.'
            : undefined,
      };
    });

    // ── 2. AutoModerator ──────────────────────────────────────────────────────
    await attempt('automoderator', async () => {
      const rawConfig = d['automoderator'];

      console.log('[SubVault] Restoring automoderator — snapshot value present:', typeof rawConfig === 'string' ? `${rawConfig.length} chars` : String(rawConfig));

      const currentWikiPages = await safeFetch(() => reddit.getWikiPages(subName), []);
      const resolvedPage =
        resolveAutomodPageName(currentWikiPages) ?? resolveAutomodPageName(d['wikiPages']) ?? DEFAULT_AUTOMOD_PAGE;
      console.log('[SubVault] Resolved automod wiki page for restore:', resolvedPage);

      if (rawConfig === 'Not configured' || typeof rawConfig !== 'string' || rawConfig.trim() === '') {
        // When snapshot says "Not configured", always delete/blank the current automod to match
        if (rawConfig === 'Not configured') {
          console.log('[SubVault] Snapshot indicates no automod — deleting current automod page to match snapshot state');

          try {
            if (typeof (reddit as any).deleteWikiPage === 'function') {
              await (reddit as any).deleteWikiPage({ subredditName: subName, page: resolvedPage });
              console.log('[SubVault] deleteWikiPage succeeded');
            } else {
              await reddit.updateWikiPage({
                subredditName: subName,
                page: resolvedPage,
                content: '',
                reason: 'SubVault: removed AutoModerator via restore (snapshot indicated none)',
              });
              console.log('[SubVault] updateWikiPage (blank) succeeded');
            }
          } catch (err) {
            console.warn('[SubVault] Error deleting automod during restore:', String(err).slice(0, 200));
          }

          restoreResults['automoderator'] = { success: true };
          return;
        }

        // For other empty cases, skip restore
        console.log('[SubVault] Skipping automoderator restore (no data in snapshot)');
        restoreResults['automoderator'] = { success: true, skipped: true };
        return;
      }

      await ensureWikiReadAccess(subName);

      await reddit.updateWikiPage({
        subredditName: subName,
        page: resolvedPage,
        content: rawConfig,
        reason: 'SubVault: restored from snapshot',
      });

      restoreResults['automoderator'] = { success: true };
    });

    // ── 3. Post flair templates ───────────────────────────────────────────────
    await attempt('postFlairs', async () => {
      const snapshotFlairs = readFlairs('post');

      const currentFlairs = await reddit.getPostFlairTemplates(subName);
      for (const flair of currentFlairs) {
        await reddit.deleteFlairTemplate(subName, flair.id);
      }

      if (snapshotFlairs.length === 0) {
        restoreResults['postFlairs'] = { success: true, skipped: true };
        return;
      }

      for (const flair of snapshotFlairs) {
        await reddit.createPostFlairTemplate({
          subredditName: subName,
          text: (flair['text'] as string) ?? '',
          textColor: (flair['textColor'] as 'light' | 'dark') ?? 'dark',
          backgroundColor: (flair['backgroundColor'] as string) ?? '',
          modOnly: (flair['modOnly'] as boolean) ?? false,
        });
      }
      restoreResults['postFlairs'] = { success: true, count: snapshotFlairs.length };
    });

    // ── 4. User flair templates ───────────────────────────────────────────────
    await attempt('userFlairs', async () => {
      const snapshotFlairs = readFlairs('user');

      const currentFlairs = await reddit.getUserFlairTemplates(subName);
      for (const flair of currentFlairs) {
        await reddit.deleteFlairTemplate(subName, flair.id);
      }

      if (snapshotFlairs.length === 0) {
        restoreResults['userFlairs'] = { success: true, skipped: true };
        return;
      }

      for (const flair of snapshotFlairs) {
        await reddit.createUserFlairTemplate({
          subredditName: subName,
          text: (flair['text'] as string) ?? '',
          textColor: (flair['textColor'] as 'light' | 'dark') ?? 'dark',
          backgroundColor: (flair['backgroundColor'] as string) ?? '',
          modOnly: (flair['modOnly'] as boolean) ?? false,
        });
      }
      restoreResults['userFlairs'] = { success: true, count: snapshotFlairs.length };
    });

    // ── 5. User management — intentionally skipped ────────────────────────────
    restoreResults['userManagement'] = { success: true, skipped: true };

    // ── 6. Audit snapshot ─────────────────────────────────────────────────────
    const timestamp = Date.now();
    const newId = `restore_${timestamp}`;
    const auditPayload = JSON.stringify({
      id: newId,
      message: `Restored from: ${targetParsed.message ?? targetId}`,
      data: targetParsed.data,
      createdAt: new Date(timestamp).toISOString(),
    });
    await Promise.all([
      redis.set(`snapshot:${newId}`, auditPayload),
      redis.hSet('snapshot_backups', { [newId]: auditPayload }),
    ]);

    console.log(`[SubVault] Restore complete. Audit snapshot: ${newId}`);

    const anyFailed = Object.values(restoreResults).some(r => !r.success);

    // Summary: only restorable sections are applied (rules, automoderator, flairs)
    // Note: other sections (settings, appearance, widgets, etc.) are read-only in Devvit Web API
    console.log('[SubVault] Restore results (restorable sections only):', JSON.stringify(restoreResults, null, 2));

    // Set a flag in Redis to prevent auto-snapshots during Reddit propagation
    await redis.set(`restore_in_progress:${subName}`, 'true');
    await redis.expire(`restore_in_progress:${subName}`, 60);
    console.log(`[SubVault] Set restore_in_progress flag for r/${subName} (60s TTL)`);
    const pollingId = `poll_${timestamp}`;
    const pollingSession: PollingSession = {
      pollingId,
      restoreId: newId,
      targetId,
      subName,
      currentAttempt: 0,
      maxAttempts: VERIFICATION_MAX_ATTEMPTS,
      isActive: true,
      verified: false,
      timedOut: false,
      createdAt: new Date().toISOString(),
    };

    await writePollingSession(pollingSession);

    return c.json({
      success: true,
      partialFailure: anyFailed,
      newId,
      pollingId,
      restoreResults,
      message: anyFailed
        ? 'Restore completed with some failures — verify status will continue to poll the live state.'
        : 'Restore applied successfully. Verifying snapshot match in the background.',
    });
  } catch (err) {
    console.error('[SubVault] Failed to restore snapshot:', err);
    return c.json({ error: 'Failed to restore snapshot' }, 500);
  }
});