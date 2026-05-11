import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { api } from './routes/api';
import { diffs } from './routes/diffs';
import { forms } from './routes/forms';
import { menu } from './routes/menu';
import { snapshot } from './routes/snapshot';
import { triggers } from './routes/triggers';
import { applySettingsRoute } from './scripts/apply-settings';

const app = new Hono();
const internal = new Hono();

internal.route('/menu', menu);
internal.route('/form', forms);
internal.route('/triggers', triggers);

app.route('/api', api);
app.route('/api/diffs', diffs);
app.route('/api/snapshot', snapshot);
app.route('/api/apply-settings', applySettingsRoute);
app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
