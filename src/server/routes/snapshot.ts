// src/server/routes/snapshot.ts
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

// ─── GET /api/snapshot/:id — single snapshot with full data ──────────────────
snapshot.get('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const snapshotMap = await redis.hGetAll('snapshot_backups');
    const raw = snapshotMap[id] ?? await redis.get(id) ?? null;

    if (!raw) return c.json({ error: 'Snapshot not found' }, 404);

    const parsed = parseStoredSnapshot(raw);
    if (!parsed) return c.json({ error: 'Corrupt snapshot' }, 500);

    return c.json({ ...toListItem(parsed), data: parsed.data ?? {} });
  } catch (error) {
    console.error('[SubVault] Failed to fetch snapshot by id:', error);
    return c.json({ error: 'Failed to fetch snapshot' }, 500);
  }
});

// ─── GET /api/snapshot/:id/diff — diff against the previous snapshot ─────────
snapshot.get('/:id/diff', async (c) => {
  const id = c.req.param('id');
  try {
    const snapshotMap = await redis.hGetAll('snapshot_backups');
    const allRaw = Object.values(snapshotMap);

    const all: Array<StoredSnapshot & { _ts: number }> = [];
    for (const raw of allRaw) {
      const p = parseStoredSnapshot(raw);
      if (!p) continue;
      const tsRaw = (p.id ?? '').replace(/\D/g, '');
      const ts = tsRaw.length > 0 ? Number.parseInt(tsRaw, 10) : 0;
      all.push({ ...p, _ts: ts });
    }
    all.sort((a, b) => b._ts - a._ts);

    const idx = all.findIndex(s => s.id === id);
    if (idx === -1) return c.json({ error: 'Snapshot not found' }, 404);

    const current = all[idx]!;
    const previous = idx + 1 < all.length ? all[idx + 1] : null;

    return c.json({
      current: {
        id: current.id,
        message: current.message,
        createdAt: current.createdAt,
        data: current.data ?? {},
      },
      previous: previous
        ? {
            id: previous.id,
            message: previous.message,
            createdAt: previous.createdAt,
            data: previous.data ?? {},
          }
        : null,
    });
  } catch (error) {
    console.error('[SubVault] Failed to compute diff context:', error);
    return c.json({ error: 'Failed to compute diff' }, 500);
  }
});

// ─── POST /api/snapshot/:id/restore — restore to a previous snapshot ─────────
snapshot.post('/:id/restore', async (c) => {
  const id = c.req.param('id');
  try {
    const body = await c.req.json<{ targetId?: string }>();
    const targetId = body.targetId;
    const subName = context.subredditName; // Need this to tell Reddit WHICH sub to update

    if (!targetId) {
      return c.json({ error: 'targetId is required' }, 400);
    }
    if (!subName) {
      return c.json({ error: 'Missing subreddit context' }, 400);
    }

    // Load the target (previous) snapshot
    const snapshotMap = await redis.hGetAll('snapshot_backups');
    const targetRaw = snapshotMap[targetId] ?? await redis.get(targetId) ?? null;

    if (!targetRaw) return c.json({ error: 'Target snapshot not found' }, 404);

    const target = parseStoredSnapshot(targetRaw);
    if (!target) return c.json({ error: 'Corrupt target snapshot' }, 500);

    const snapshotData = target.data ?? {};

    // ==========================================
    // THE MISSING PIECE: ACTUALLY RESTORE REDDIT
    // ==========================================

    // 1. Restore Automoderator Config
    if (snapshotData.automoderator && snapshotData.automoderator !== "Not configured") {
      try {
        console.log(`[SubVault] Restoring Automod for r/${subName}...`);
        await reddit.updateWikiPage({
          subredditName: subName,
          page: 'config/automoderator',
          content: snapshotData.automoderator as string,
          reason: `Restored to backup ${targetId} via SubVault`
        });
      } catch (err) {
        console.error('[SubVault] Failed to overwrite Automod wiki:', err);
      }
    }

    // 2. Restore Subreddit Settings
    if (snapshotData.settings) {
      try {
        console.log(`[SubVault] Restoring Settings for r/${subName}...`);
        
        // 1. Fetch the Subreddit object first
        const subreddit = await reddit.getSubredditByName(subName);
        
        // 2. Call updateSettings directly on that object
        await subreddit.updateSettings(
          snapshotData.settings as Record<string, unknown>
        );
        
      } catch (err) {
        console.error('[SubVault] Failed to overwrite Subreddit Settings:', err);
      }
    }

    // ==========================================

    // Create a new restore-point snapshot for the timeline
    const timestamp = Date.now();
    const newId = `restore_${timestamp}`;
    const originalMessage = target.message ?? 'Unknown snapshot';

    const restored = {
      id: newId,
      message: `Restore: reverted to "${originalMessage}"`,
      data: snapshotData, // Save the data we just pushed
      createdAt: new Date(timestamp).toISOString(),
      restoredFrom: targetId,
    };

    const payload = JSON.stringify(restored);

    await Promise.all([
      redis.set(`snapshot:${newId}`, payload),
      redis.hSet('snapshot_backups', { [newId]: payload }),
    ]);

    console.log(`[SubVault] Restore snapshot saved id=${newId} from targetId=${targetId}`);

    return c.json({
      id: newId,
      author: 'System Restore',
      hash: String(timestamp).slice(-7),
      message: restored.message,
      timestamp: restored.createdAt,
      changes: Object.keys(restored.data).length,
      status: 'success',
    }, 201);
  } catch (error) {
    console.error('[SubVault] Failed to restore snapshot:', error);
    return c.json({ error: 'Failed to restore snapshot' }, 500);
  }
});

// ─── POST /api/snapshot — create manual snapshot ─────────────────────────────
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

    // ── Fetch live subreddit data ──────────────────────────────────────────
    const subreddit = await reddit.getSubredditByName(subName);

    // Community visibility & type
    console.log('[SubVault] Type:', subreddit.type);
    console.log('[SubVault] NSFW:', subreddit.nsfw);

    // Textual identity
    console.log('[SubVault] Name:', subreddit.name);
    console.log('[SubVault] Title:', subreddit.title);
    console.log('[SubVault] Description:', subreddit.description);
    console.log('[SubVault] Language:', subreddit.language);

    // Stats
    console.log('[SubVault] Subscribers:', subreddit.numberOfSubscribers);
    console.log('[SubVault] Active Users:', subreddit.numberOfActiveUsers);

    // Flair settings
    console.log('[SubVault] Post Flairs Enabled:', subreddit.postFlairsEnabled);
    console.log('[SubVault] User Flairs Enabled:', subreddit.userFlairsEnabled);
    console.log('[SubVault] Users Can Assign Post Flairs:', subreddit.usersCanAssignPostFlairs);
    console.log('[SubVault] Users Can Assign User Flairs:', subreddit.usersCanAssignUserFlairs);

    // Settings blob
    console.log('[SubVault] Settings:', subreddit.settings);

    // Community rules
    const rules = await reddit.getRules(subreddit.name);
    console.log('[SubVault] Rules:', rules);

    // Removal reasons
    const removalReasons = await reddit.getSubredditRemovalReasons(subreddit.name);
    for (const reason of removalReasons) {
      console.log('[SubVault] Removal Reason:', reason.id, reason.title, reason.message);
    }

    // Sidebar widgets
    const widgets = await reddit.getWidgets(subreddit.name);
    console.log('[SubVault] Widgets:', widgets);

    // Moderation log (last 100)
    const modLog = await reddit.getModerationLog({
      subredditName: subreddit.name,
      limit: 100,
    }).all();
    console.log('[SubVault] Mod Log:', modLog);

    // Subreddit styles
    const styles = await reddit.getSubredditStyles(subreddit.id);
    console.log('[SubVault] Styles:', styles);
    // ──────────────────────────────────────────────────────────────────────

    const timestamp = Date.now();
    const id = `manual_${timestamp}`;

    const stored = {
      id,
      message,
      data: {
        description: body.description ?? '',
        // Community info
        type: subreddit.type,
        nsfw: subreddit.nsfw,
        name: subreddit.name,
        title: subreddit.title,
        subredditDescription: subreddit.description,
        language: subreddit.language,
        // Stats
        numberOfSubscribers: subreddit.numberOfSubscribers,
        numberOfActiveUsers: subreddit.numberOfActiveUsers,
        // Flair
        postFlairsEnabled: subreddit.postFlairsEnabled,
        userFlairsEnabled: subreddit.userFlairsEnabled,
        usersCanAssignPostFlairs: subreddit.usersCanAssignPostFlairs,
        usersCanAssignUserFlairs: subreddit.usersCanAssignUserFlairs,
        // Structured data
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

    const response: SnapshotListItem = {
      id,
      author: 'Manual Commit',
      hash: String(timestamp).slice(-7),
      message,
      timestamp: stored.createdAt,
      changes: Object.keys(stored.data).length,
      status: 'success',
    };

    console.log('[SubVault] Manual snapshot saved to Redis:', id);
    return c.json(response, 201);
  } catch (error) {
    console.error('[SubVault] Failed to save manual snapshot:', error);
    return c.json({ error: 'Failed to save snapshot' }, 500);
  }
});