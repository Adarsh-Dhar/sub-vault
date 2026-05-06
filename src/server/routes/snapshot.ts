// src/server/routes/snapshot.ts
import { Hono } from 'hono';
import { redis } from '@devvit/web/server';

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
    // Try snapshot_backups hash first, then direct key
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

    // Parse all and sort newest-first
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
    // Previous in time = next index (sorted newest-first)
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

// ─── POST /api/snapshot — create manual snapshot ─────────────────────────────
snapshot.post('/', async (c) => {
  try {
    const body = await c.req.json<{ message?: string; description?: string }>();
    const message =
      typeof body.message === 'string' && body.message.trim()
        ? body.message.trim()
        : 'Manual snapshot';

    const timestamp = Date.now();
    const id = `manual_${timestamp}`;

    const stored = {
      id,
      message,
      data: { description: body.description ?? '' },
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
      changes: 0,
      status: 'success',
    };

    console.log('[SubVault] Manual snapshot saved to Redis:', id);
    return c.json(response, 201);
  } catch (error) {
    console.error('[SubVault] Failed to save manual snapshot:', error);
    return c.json({ error: 'Failed to save snapshot' }, 500);
  }
});