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
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const candidate = parsed;
  const snapshot: StoredSnapshot = {};

  if ('id' in candidate && typeof candidate.id === 'string') {
    snapshot.id = candidate.id;
  }

  if ('message' in candidate && typeof candidate.message === 'string') {
    snapshot.message = candidate.message;
  }

  if ('createdAt' in candidate && typeof candidate.createdAt === 'string') {
    snapshot.createdAt = candidate.createdAt;
  }

  if (
    'data' in candidate &&
    typeof candidate.data === 'object' &&
    candidate.data !== null
  ) {
    snapshot.data = Object.fromEntries(Object.entries(candidate.data));
  }

  return snapshot;
}

// GET — list all snapshots from Redis
snapshot.get('/', async (c) => {
  try {
    const snapshotMap = await redis.hGetAll('snapshot_backups');
    const snapshotsRaw = Object.values(snapshotMap);

    if (snapshotsRaw.length === 0) {
      return c.json([]);
    }

    const snapshots: SnapshotListItem[] = [];

    for (const raw of snapshotsRaw) {
      try {
        const parsed = parseStoredSnapshot(raw);
        if (!parsed) {
          continue;
        }

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
          const matchedAuthor = match?.[1];
          author = matchedAuthor ?? 'System Mod';
        }

        snapshots.push({
          id: snapshotId,
          author,
          hash: timestampRaw.slice(-7),
          message,
          timestamp: parsed.createdAt ?? fallbackTimestamp,
          changes: Object.keys(parsed.data ?? {}).length,
          status: 'success',
        });
      } catch (error) {
        console.error('[SubVault] Failed to parse stored snapshot payload:', error);
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

// POST — persist a manually created snapshot to Redis
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