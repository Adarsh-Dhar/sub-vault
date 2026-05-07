import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';

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
    snap.data = Object.fromEntries(Object.entries(candidate['data'] as Record<string, unknown>));
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
  if (message.includes('Triggered by')) {
    const match = message.match(/Triggered by (.+?) via/);
    author = match?.[1] ?? 'System Mod';
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

// ─── GET /api/snapshot — list all ────────────────────────────────────────────
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
      } catch (error) {
        console.error('[SubVault] Failed to parse snapshot:', error);
      }
    }

    snapshots.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return c.json(snapshots);
  } catch (error) {
    console.error('[SubVault] Failed to fetch snapshots:', error);
    return c.json({ error: 'Failed to fetch snapshots' }, 500);
  }
});

// ─── POST /api/snapshot — create snapshot with full subreddit details saved ───
snapshot.post('/', async (c) => {
  try {
    const body = await c.req.json<{ message?: string; description?: string }>();
    const message =
      typeof body.message === 'string' && body.message.trim()
        ? body.message.trim()
        : 'Manual snapshot';

    const subName = context.subredditName;
    if (!subName) {
      return c.json({ error: 'Missing subreddit context' }, 400);
    }

    const subreddit = await reddit.getSubredditByName(subName);

    // Log everything
    console.log('[SubVault] === Creating Snapshot ===');
    console.log('[SubVault] Type:', subreddit.type);
    console.log('[SubVault] NSFW:', subreddit.nsfw);
    console.log('[SubVault] Name:', subreddit.name);
    console.log('[SubVault] Title:', subreddit.title);
    console.log('[SubVault] Description:', subreddit.description);
    console.log('[SubVault] Language:', subreddit.language);
    console.log('[SubVault] Subscribers:', subreddit.numberOfSubscribers);
    console.log('[SubVault] Active Users:', subreddit.numberOfActiveUsers);
    console.log('[SubVault] Post Flairs Enabled:', subreddit.postFlairsEnabled);
    console.log('[SubVault] User Flairs Enabled:', subreddit.userFlairsEnabled);
    console.log('[SubVault] Users Can Assign Post Flairs:', subreddit.usersCanAssignPostFlairs);
    console.log('[SubVault] Users Can Assign User Flairs:', subreddit.usersCanAssignUserFlairs);
    console.log('[SubVault] Settings:', subreddit.settings);

    const rules = await reddit.getRules(subreddit.name);
    console.log('[SubVault] Rules:', rules);

    const removalReasons = await reddit.getSubredditRemovalReasons(subreddit.name);
    for (const reason of removalReasons) {
      console.log('[SubVault] Removal Reason:', reason.id, reason.title, reason.message);
    }

    const widgets = await reddit.getWidgets(subreddit.name);
    console.log('[SubVault] Widgets:', widgets);

    const modLog = await reddit.getModerationLog({
      subredditName: subreddit.name,
      limit: 100,
    }).all();
    console.log('[SubVault] Mod Log:', modLog);

    const styles = await reddit.getSubredditStyles(subreddit.id);
    console.log('[SubVault] Styles:', styles);

    const timestamp = Date.now();
    const id = `manual_${timestamp}`;

    const stored = {
      id,
      message,
      data: {
        description: body.description ?? '',
        type: subreddit.type,
        nsfw: subreddit.nsfw,
        name: subreddit.name,
        title: subreddit.title,
        subredditDescription: subreddit.description,
        language: subreddit.language,
        numberOfSubscribers: subreddit.numberOfSubscribers,
        numberOfActiveUsers: subreddit.numberOfActiveUsers,
        postFlairsEnabled: subreddit.postFlairsEnabled,
        userFlairsEnabled: subreddit.userFlairsEnabled,
        usersCanAssignPostFlairs: subreddit.usersCanAssignPostFlairs,
        usersCanAssignUserFlairs: subreddit.usersCanAssignUserFlairs,
        settings: subreddit.settings,
        rules,
        removalReasons,
        widgets,
        modLog,
        styles,
      },
      createdAt: new Date(timestamp).toISOString(),
    };

    const payload = JSON.stringify(stored);
    await Promise.all([
      redis.set(`snapshot:${id}`, payload),
      redis.hSet('snapshot_backups', { [id]: payload }),
    ]);

    console.log('[SubVault] Snapshot saved to Redis:', id);

    return c.json({
      id,
      author: 'Manual Commit',
      hash: String(timestamp).slice(-7),
      message,
      timestamp: stored.createdAt,
      changes: Object.keys(stored.data).length,
      status: 'success',
    }, 201);
  } catch (error) {
    console.error('[SubVault] Failed to save snapshot:', error);
    return c.json({ error: 'Failed to save snapshot' }, 500);
  }
});

// ─── GET /api/snapshot/:id — fetch + log full details on demand (Details button) ──
snapshot.get('/:id', async (c) => {
  const id = c.req.param('id');
  const subName = context.subredditName;

  if (!subName) {
    return c.json({ error: 'Missing subreddit context' }, 400);
  }

  try {
    const subreddit = await reddit.getSubredditByName(subName);

    // Log every field for this snapshot view
    console.log('[SubVault] === Snapshot Details for id:', id, '===');
    console.log('[SubVault] Type:', subreddit.type);
    console.log('[SubVault] NSFW:', subreddit.nsfw);
    console.log('[SubVault] Name:', subreddit.name);
    console.log('[SubVault] Title:', subreddit.title);
    console.log('[SubVault] Description:', subreddit.description);
    console.log('[SubVault] Language:', subreddit.language);
    console.log('[SubVault] Subscribers:', subreddit.numberOfSubscribers);
    console.log('[SubVault] Active Users:', subreddit.numberOfActiveUsers);
    console.log('[SubVault] Post Flairs Enabled:', subreddit.postFlairsEnabled);
    console.log('[SubVault] User Flairs Enabled:', subreddit.userFlairsEnabled);
    console.log('[SubVault] Users Can Assign Post Flairs:', subreddit.usersCanAssignPostFlairs);
    console.log('[SubVault] Users Can Assign User Flairs:', subreddit.usersCanAssignUserFlairs);
    console.log('[SubVault] Settings:', subreddit.settings);

    const rules = await reddit.getRules(subreddit.name);
    console.log('[SubVault] Rules:', rules);

    const removalReasons = await reddit.getSubredditRemovalReasons(subreddit.name);
    for (const reason of removalReasons) {
      console.log('[SubVault] Removal Reason:', reason.id, reason.title, reason.message);
    }

    const widgets = await reddit.getWidgets(subreddit.name);
    console.log('[SubVault] Widgets:', widgets);

    const modLog = await reddit.getModerationLog({
      subredditName: subreddit.name,
      limit: 100,
    }).all();
    console.log('[SubVault] Mod Log:', modLog);

    const styles = await reddit.getSubredditStyles(subreddit.id);
    console.log('[SubVault] Styles:', styles);

    // Store the fetched details under this snapshot id
    const snapshotMap = await redis.hGetAll('snapshot_backups');
    const raw = snapshotMap[id] ?? await redis.get(id) ?? null;

    const parsed = raw ? parseStoredSnapshot(raw) : null;
    const base = parsed ? toListItem(parsed) : { id, author: 'Unknown', hash: '', message: '', timestamp: new Date().toISOString(), changes: 0, status: 'success' as const };

    const detailData = {
      type: subreddit.type,
      nsfw: subreddit.nsfw,
      name: subreddit.name,
      title: subreddit.title,
      subredditDescription: subreddit.description,
      language: subreddit.language,
      numberOfSubscribers: subreddit.numberOfSubscribers,
      numberOfActiveUsers: subreddit.numberOfActiveUsers,
      postFlairsEnabled: subreddit.postFlairsEnabled,
      userFlairsEnabled: subreddit.userFlairsEnabled,
      usersCanAssignPostFlairs: subreddit.usersCanAssignPostFlairs,
      usersCanAssignUserFlairs: subreddit.usersCanAssignUserFlairs,
      settings: subreddit.settings,
      rules,
      removalReasons,
      widgets,
      modLog,
      styles,
    };

    // Persist the detail data back into the snapshot entry
    const updated = {
      ...(parsed ?? {}),
      id,
      data: {
        ...(parsed?.data ?? {}),
        ...detailData,
      },
    };

    const payload = JSON.stringify(updated);
    await Promise.all([
      redis.set(`snapshot:${id}`, payload),
      redis.hSet('snapshot_backups', { [id]: payload }),
    ]);

    return c.json({ ...base, data: detailData });
  } catch (error) {
    console.error('[SubVault] Failed to fetch snapshot details:', error);
    return c.json({ error: 'Failed to fetch snapshot details' }, 500);
  }
});