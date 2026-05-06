import { Hono } from 'hono';

type DiffType = 'add' | 'remove' | 'modify';

type Diff = {
  type: DiffType;
  file: string;
  additions: number;
  deletions: number;
  content?: string;
};

type SnapshotDiff = Diff & {
  snapshotId: string;
};

type CreateDiffBody = {
  snapshotId?: string;
  file?: string;
  additions?: number;
  deletions?: number;
  type?: DiffType;
  content?: string;
};

const mockDiffs: Diff[] = [
  {
    type: 'add',
    file: 'src/auth/middleware.ts',
    additions: 42,
    deletions: 0,
    content: `+ export async function authenticateUser(req: Request) {
+   const token = req.headers.authorization?.split(' ')[1];
+   if (!token) return null;
+   try {
+     const decoded = jwt.verify(token, process.env.JWT_SECRET);
+     return decoded;
+   } catch {
+     return null;
+   }
+ }`,
  },
  {
    type: 'remove',
    file: 'src/legacy/oldAuth.ts',
    additions: 0,
    deletions: 28,
    content: `- // Old authentication approach (deprecated)
- function legacyAuth(credentials) {
-   const hash = md5(credentials.password);
-   return validateHash(hash);
- }`,
  },
  {
    type: 'modify',
    file: 'src/api/routes.ts',
    additions: 12,
    deletions: 8,
    content: `- app.get('/users', handleRequest);
+ app.get('/users', authenticate, handleRequest);
+
+ app.post('/users/logout', authenticate, (req, res) => {
+   res.json({ success: true });
+ });`,
  },
];

export const diffs = new Hono();

diffs.get('/', (c) => {
  const snapshotId = c.req.query('snapshotId') ?? 'default';
  const result: SnapshotDiff[] = mockDiffs.map((item) => ({
    ...item,
    snapshotId,
  }));

  return c.json(result);
});

diffs.post('/', async (c) => {
  try {
    const body = await c.req.json<CreateDiffBody>();
    const snapshotId = typeof body.snapshotId === 'string' ? body.snapshotId.trim() : '';
    const file = typeof body.file === 'string' ? body.file.trim() : '';

    if (!snapshotId || !file) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const newDiff: SnapshotDiff = {
      snapshotId,
      type: body.type ?? 'modify',
      file,
      additions: Number.isFinite(body.additions) ? Number(body.additions) : 0,
      deletions: Number.isFinite(body.deletions) ? Number(body.deletions) : 0,
      content: typeof body.content === 'string' ? body.content : '',
    };

    return c.json(newDiff, 201);
  } catch {
    return c.json({ error: 'Failed to create diff' }, 500);
  }
});
