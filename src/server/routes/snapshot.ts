import { Hono } from 'hono';

type SnapshotStatus = 'success' | 'warning' | 'error';

type CommitSnapshot = {
  id: string;
  author: string;
  hash: string;
  message: string;
  timestamp: Date;
  changes: number;
  status: SnapshotStatus;
};

type CreateSnapshotBody = {
  message?: string;
};

const mockSnapshots: CommitSnapshot[] = [
  {
    id: '1',
    author: 'Alex Chen',
    hash: 'a3f2b1c',
    message: 'feat: Add user authentication module',
    timestamp: new Date('2024-05-06T14:30:00'),
    changes: 48,
    status: 'success',
  },
  {
    id: '2',
    author: 'Sarah Johnson',
    hash: 'f8e4d2a',
    message: 'fix: Resolve database connection timeout issue',
    timestamp: new Date('2024-05-05T10:15:00'),
    changes: 12,
    status: 'success',
  },
  {
    id: '3',
    author: 'Mike Rodriguez',
    hash: '5c9b3e1',
    message: 'refactor: Optimize API response handling',
    timestamp: new Date('2024-05-04T16:45:00'),
    changes: 35,
    status: 'warning',
  },
];

export const snapshot = new Hono();

snapshot.get('/', (c) => {
  const search = c.req.query('search')?.toLowerCase().trim();

  if (!search) {
    return c.json(mockSnapshots);
  }

  const results = mockSnapshots.filter(
    (item) =>
      item.author.toLowerCase().includes(search) ||
      item.message.toLowerCase().includes(search) ||
      item.hash.toLowerCase().includes(search)
  );

  return c.json(results);
});

snapshot.post('/', async (c) => {
  try {
    const body = await c.req.json<CreateSnapshotBody>();
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!message) {
      return c.json({ error: 'Message is required' }, 400);
    }

    const newSnapshot: CommitSnapshot = {
      id: String(Date.now()),
      author: 'API User',
      hash: Math.random().toString(16).slice(2, 9),
      message,
      timestamp: new Date(),
      changes: Math.floor(Math.random() * 100) + 10,
      status: 'success',
    };

    return c.json(newSnapshot, 201);
  } catch {
    return c.json({ error: 'Failed to create snapshot' }, 500);
  }
});
