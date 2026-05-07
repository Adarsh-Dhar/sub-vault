/* eslint-disable @typescript-eslint/no-explicit-any */
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
    // Try to extract author from "— by username" format (used for all manual/auto snapshots)
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

  // Check if user has wiki permission or if they have all permissions
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

// ─── Single capture function used by both POST /snapshot and triggers ─────────
// Stores everything in a consistent shape so the restore route can always
// find data.rules, data.flairs.post, data.flairs.user, data.automoderator.
async function captureNormalizedSnapshot(subName: string): Promise<Record<string, unknown>> {
  const [
    subredditInfo,
    rules,
    removalReasons,
    postFlairs,
    userFlairs,
    widgets,
    wikiPages,
    bannedUsers,
    mutedUsers,
    approvedUsers,
    moderators,
  ] = await Promise.all([
    safeFetch(() => reddit.getSubredditInfoByName(subName), null),
    safeFetch(() => reddit.getRules(subName), []),
    safeFetch(() => reddit.getSubredditRemovalReasons(subName), []),
    safeFetch(() => reddit.getPostFlairTemplates(subName), []),
    safeFetch(() => reddit.getUserFlairTemplates(subName), []),
    safeFetch(() => reddit.getWidgets(subName), null),
    safeFetch(() => reddit.getWikiPages(subName), []),
    safeFetch(async () => {
      const users: Array<Record<string, unknown>> = [];
      for await (const u of reddit.getBannedUsers({ subredditName: subName, limit: 100 })) {
        users.push({ username: u.username, note: (u as any).banNote ?? '' });
        if (users.length >= 100) break;
      }
      return users;
    }, []),
    safeFetch(async () => {
      const users: Array<Record<string, unknown>> = [];
      for await (const u of reddit.getMutedUsers({ subredditName: subName, limit: 100 })) {
        users.push({ username: u.username });
        if (users.length >= 100) break;
      }
      return users;
    }, []),
    safeFetch(async () => {
      const users: Array<Record<string, unknown>> = [];
      for await (const u of reddit.getApprovedUsers({ subredditName: subName, limit: 100 })) {
        users.push({ username: u.username });
        if (users.length >= 100) break;
      }
      return users;
    }, []),
    safeFetch(async () => {
      const mods: Array<Record<string, unknown>> = [];
      for await (const m of reddit.getModerators({ subredditName: subName })) {
        mods.push({ username: m.username, permissions: (m as any).permissions ?? [] });
        if (mods.length >= 100) break;
      }
      return mods;
    }, []),
  ]);

  let automoderator = 'Not configured';
  try {
    await ensureWikiReadAccess(subName);
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

  const info = subredditInfo as any;

  // Normalize rules — store the exact fields addRule() needs so restore
  // can pass them straight back without any guessing.
  const normalizedRules = (rules as any[]).map((r: any, i: number) => ({
    shortName: r.shortName ?? r.name ?? `Rule ${i + 1}`,
    description: r.description ?? '',
    violationReason: r.violationReason ?? r.shortName ?? r.name ?? '',
    kind: r.kind ?? 'all',
    priority: r.priority ?? i,
  }));

  // Normalize flairs — store the exact fields createPostFlairTemplate() needs.
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
      lang: info.lang ?? 'en',
      allowGalleries: info.allowGalleries ?? null,
      allowImages: info.allowImages ?? null,
      allowVideos: info.allowVideos ?? null,
      allowPolls: info.allowPolls ?? null,
    } : null,
    settings: info ? {
      title: info.title ?? '',
      publicDescription: info.publicDescription ?? '',
      description: info.description ?? '',
      subredditType: info.subredditType ?? info.type ?? '',
      nsfw: typeof info.over18 === 'boolean' ? info.over18 : (info.nsfw ?? false),
      lang: info.lang ?? 'en',
      allowGalleries: info.allowGalleries ?? null,
      allowImages: info.allowImages ?? null,
      allowVideos: info.allowVideos ?? null,
      allowPolls: info.allowPolls ?? null,
    } : null,
    // These three sections are what restore actually writes back to Reddit:
    rules: normalizedRules,
    flairs: {
      post: normalizedPostFlairs,
      user: normalizedUserFlairs,
    },
    automoderator,
    // Read-only / informational sections:
    removalReasons: (removalReasons as any[]).map((r: any) => ({
      id: r.id ?? '',
      title: r.title ?? '',
      message: r.message ?? '',
    })),
    widgets: widgets ? (widgets as any[]).map((w: any) => ({
      id: w.id ?? '',
      name: w.name ?? '',
      type: w.kind ?? w.type ?? '',
    })) : null,
    wikiPages,
    userManagement: {
      banned: bannedUsers,
      muted: mutedUsers,
      approved: approvedUsers,
      moderators,
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

    // Get the current moderator's username
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
    
    // Extract author from message for response
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

// ─── POST /api/snapshot/:id/restore ──────────────────────────────────────────
snapshot.post('/:id/restore', async (c) => {
  try {
    const body = await c.req.json<{ targetId?: string; deleteAutomodIfMissing?: boolean }>();
    const targetId = body.targetId;
    const deleteAutomodIfMissing = body.deleteAutomodIfMissing === true;
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

    // ── Helpers to read data regardless of which snapshot shape wrote it ──────

    // Rules: read from data.rules (both old and new shape use this key)
    // Normalize on the way out so addRule() always gets the right fields.
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

    // Flairs: both shapes store under data.flairs.post / data.flairs.user
    const readFlairs = (kind: 'post' | 'user'): Array<Record<string, unknown>> => {
      const block = d['flairs'] as Record<string, unknown> | undefined;
      const arr = block?.[kind];
      return Array.isArray(arr) ? arr as Array<Record<string, unknown>> : [];
    };

    // ── 1. Rules (additive restore — Devvit cannot delete rules) ──────────────
    await attempt('rules', async () => {
      const snapshotRules = readRules();

      if (snapshotRules.length === 0) {
        restoreResults['rules'] = { success: true, skipped: true };
        return;
      }

      // Fetch current rules to avoid creating duplicates
      const currentRules = await reddit.getRules(subName);
      const currentRuleNames = new Set(
        currentRules.map((r: any) => (r.shortName ?? '').toLowerCase()),
      );

      const sorted = [...snapshotRules].sort((a, b) => (a['priority'] as number) - (b['priority'] as number));

      let addedCount = 0;
      for (const rule of sorted) {
        const shortName = (rule['shortName'] as string) || 'Rule';

        // Only create the rule if it doesn't already exist on the subreddit
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

      // Note: Devvit cannot delete existing rules. We add missing ones only.
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

      // Prefer resolving the automod page from the *current* wiki pages list,
      // falling back to the snapshot's wikiPages if necessary. This avoids
      // updating the wrong page when wiki page names have changed since the
      // snapshot was taken.
      const currentWikiPages = await safeFetch(() => reddit.getWikiPages(subName), []);
      const resolvedPage =
        resolveAutomodPageName(currentWikiPages) ?? resolveAutomodPageName(d['wikiPages']) ?? DEFAULT_AUTOMOD_PAGE;
      console.log('[SubVault] Resolved automod wiki page for restore:', resolvedPage);

      // Log a short preview of the snapshot content for debugging
      const preview = typeof rawConfig === 'string' ? rawConfig.slice(0, 200).replace(/\s+/g, ' ') : String(rawConfig);
      console.log('[SubVault] Snapshot automoderator preview:', preview);
      // If snapshot indicates automod is not configured, optionally delete/blank the wiki page
      if (rawConfig === 'Not configured' || typeof rawConfig !== 'string' || rawConfig.trim() === '') {
        if (!deleteAutomodIfMissing) {
          console.log('[SubVault] Skipping automoderator restore (snapshot indicates not configured and deleteAutomodIfMissing=false)');
          restoreResults['automoderator'] = { success: true, skipped: true };
          return;
        }

        // perform destructive removal/blanking as explicitly requested
        console.log(`[SubVault] deleteAutomodIfMissing=true — removing automoderator page (${resolvedPage}) for r/${subName}`);

        // Read current page before attempting delete/blank
        try {
          const before = await safeFetch(() => reddit.getWikiPage(subName, resolvedPage), null as any);
          console.log('[SubVault] Pre-delete wiki page content:', before ? `present (${String(before.content ?? '').length} chars)` : 'null/404');
        } catch (e) {
          console.warn('[SubVault] Pre-delete wiki page read failed:', String(e).slice(0, 200));
        }

        // Prefer deleteWikiPage if available; otherwise blank the page via update
        if (typeof (reddit as any).deleteWikiPage === 'function') {
          await (reddit as any).deleteWikiPage({ subredditName: subName, page: resolvedPage });
          console.log('[SubVault] deleteWikiPage succeeded');
        } else {
          await reddit.updateWikiPage({
            subredditName: subName,
            page: resolvedPage,
            content: '',
            reason: 'SubVault: removed AutoModerator via restore',
          });
          console.log('[SubVault] updateWikiPage (blank) succeeded');
        }

        // verify result
        try {
          const check = await safeFetch(() => reddit.getWikiPage(subName, resolvedPage), null as any);
          console.log('[SubVault] Post-delete check wiki page content:', check ? `present (${String(check.content ?? '').length} chars)` : 'null/404');
        } catch (e) {
          console.warn('[SubVault] Post-delete verification failed:', String(e).slice(0, 200));
        }

        restoreResults['automoderator'] = { success: true };
        return;
      }

      // Otherwise restore the automod config from the snapshot
      await ensureWikiReadAccess(subName);

      // Read current page before update for diagnostics
      try {
        const before = await safeFetch(() => reddit.getWikiPage(subName, resolvedPage), null as any);
        console.log('[SubVault] Pre-restore wiki page content:', before ? `present (${String(before.content ?? '').length} chars)` : 'null/404');
      } catch (e) {
        console.warn('[SubVault] Pre-restore wiki page read failed:', String(e).slice(0, 200));
      }

      await reddit.updateWikiPage({
        subredditName: subName,
        page: resolvedPage,
        content: rawConfig,
        reason: 'SubVault: restored from snapshot',
      });

      // verify the updated page contains the content we just wrote
      try {
        const check = await safeFetch(() => reddit.getWikiPage(subName, resolvedPage), null as any);
        console.log('[SubVault] Post-restore wiki page content length:', check ? String(check.content ?? '').length : 'null');
        if (check && typeof check.content === 'string' && check.content.trim() !== rawConfig.trim()) {
          console.warn('[SubVault] Warning: Post-restore wiki content does not match snapshot content (lengths:', String(check.content.length), 'vs', String((rawConfig as string).length), ')');
        }
      } catch (e) {
        console.warn('[SubVault] Post-restore verification failed:', String(e).slice(0, 200));
      }

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
    console.log('[SubVault] Restore results:', JSON.stringify(restoreResults, null, 2));

    const anyFailed = Object.values(restoreResults).some(r => !r.success);
    return c.json({
      success: true,
      partialFailure: anyFailed,
      newId,
      restoreResults,
      message: anyFailed
        ? 'Restore completed with some failures — check restoreResults for details.'
        : 'Snapshot fully restored to subreddit.',
    });
  } catch (err) {
    console.error('[SubVault] Failed to restore snapshot:', err);
    return c.json({ error: 'Failed to restore snapshot' }, 500);
  }
});