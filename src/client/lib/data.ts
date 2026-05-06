import { CommitSnapshot, Diff, SubVaultMetrics } from './types';

export const mockSnapshots: CommitSnapshot[] = [
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
  {
    id: '4',
    author: 'Emma Wilson',
    hash: '2d7f6a9',
    message: 'docs: Update README with new endpoints',
    timestamp: new Date('2024-05-03T09:20:00'),
    changes: 8,
    status: 'success',
  },
  {
    id: '5',
    author: 'James Lee',
    hash: 'b4e8c3f',
    message: 'test: Add comprehensive unit tests for payment module',
    timestamp: new Date('2024-05-02T13:00:00'),
    changes: 156,
    status: 'error',
  },
];

export const mockDiffs: Diff[] = [
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
+   } catch (error) {
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

export const mockMetrics: SubVaultMetrics = {
  totalSnapshots: 247,
  activeSubscriptions: 12,
  successRate: 94.2,
};
