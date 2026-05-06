import express from 'express';
import authenticateUser from '../auth/middleware';

const app = express();

// Express middleware wrapper using authenticateUser
function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  authenticateUser(req)
    .then((decoded) => {
      if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
      (req as any).user = decoded;
      next();
    })
    .catch(() => res.status(401).json({ error: 'Unauthorized' }));
}

// Placeholder handler — replace with real implementation
function handleRequest(req: express.Request, res: express.Response) {
  res.json({ users: [] });
}

app.get('/users', authenticate, handleRequest);

app.post('/users/logout', authenticate, (req, res) => {
  res.json({ success: true });
});

export default app;
