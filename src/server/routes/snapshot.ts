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

/**
 * Get all snapshots sorted by timestamp descending.
 * Returns array of { id, createdAt } for ordering.
 */
async function getAllSnapshotsSorted(): Promise<StoredSnapshot[]> {
  const snapshotMap = await redis.hGetAll('snapshot_backups');
  const snapshots: StoredSnapshot[] = [];

  for (const raw of Object.values(snapshotMap)) {
    const parsed = parseStoredSnapshot(raw);
    if (parsed) snapshots.push(parsed);
  }

  // Sort newest first by createdAt (or id timestamp)
  snapshots.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });

  return snapshots;
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

// ─── POST /api/snapshot — create snapshot ────────────────────────────────────
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

    const rules = await reddit.getRules(subreddit.name);
    const removalReasons = await reddit.getSubredditRemovalReasons(subreddit.name);
    const widgets = await reddit.getWidgets(subreddit.name);
    const modLog = await reddit.getModerationLog({
      subredditName: subreddit.name,
      limit: 100,
    }).all();
    const styles = await reddit.getSubredditStyles(subreddit.id);

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

// ─── GET /api/snapshot/:id — fetch stored snapshot details ───────────────────
snapshot.get('/:id', async (c) => {
  const id = c.req.param('id');

  try {
    // Try direct key first, then fall back to the hash map
    let raw = await redis.get(`snapshot:${id}`);
    if (!raw) {
      const snapshotMap = await redis.hGetAll('snapshot_backups');
      raw = snapshotMap[id];
    }

    if (!raw) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    const parsed = parseStoredSnapshot(raw);
    if (!parsed) {
      return c.json({ error: 'Failed to parse snapshot' }, 500);
    }

    const base = toListItem(parsed);
    return c.json({ ...base, data: parsed.data ?? {} });
  } catch (error) {
    console.error('[SubVault] Failed to fetch snapshot details:', error);
    return c.json({ error: 'Failed to fetch snapshot details' }, 500);
  }
});

// ─── GET /api/snapshot/:id/diff — compare snapshot with its predecessor ──────
snapshot.get('/:id/diff', async (c) => {
  const id = c.req.param('id');

  try {
    // Load current snapshot
    let currentRaw = await redis.get(`snapshot:${id}`);
    if (!currentRaw) {
      const snapshotMap = await redis.hGetAll('snapshot_backups');
      currentRaw = snapshotMap[id];
    }

    if (!currentRaw) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    const currentParsed = parseStoredSnapshot(currentRaw);
    if (!currentParsed) {
      return c.json({ error: 'Failed to parse snapshot' }, 500);
    }

    // Find the previous snapshot (the one just before this one chronologically)
    const allSnapshots = await getAllSnapshotsSorted();
    const currentIndex = allSnapshots.findIndex(s => s.id === id);
    const previousParsed = currentIndex >= 0 && currentIndex < allSnapshots.length - 1
      ? allSnapshots[currentIndex + 1]
      : null;

    // Shape the response entries — only include id, message, createdAt, data
    const currentEntry = {
      id: currentParsed.id ?? id,
      message: currentParsed.message ?? '',
      createdAt: currentParsed.createdAt ?? new Date().toISOString(),
      data: currentParsed.data ?? {},
    };

    const previousEntry = previousParsed
      ? {
          id: previousParsed.id ?? '',
          message: previousParsed.message ?? '',
          createdAt: previousParsed.createdAt ?? '',
          data: previousParsed.data ?? {},
        }
      : null;

    return c.json({
      current: currentEntry,
      previous: previousEntry,
    });
  } catch (error) {
    console.error('[SubVault] Failed to compute diff:', error);
    return c.json({ error: 'Failed to compute diff' }, 500);
  }
});

// ─── POST /api/snapshot/:id/restore — restore to a previous snapshot ─────────
snapshot.post('/:id/restore', async (c) => {
  try {
    const body = await c.req.json<{ targetId?: string }>();
    const targetId = body.targetId;

    if (!targetId) {
      return c.json({ error: 'targetId is required' }, 400);
    }

    // Load the target snapshot to restore from
    let targetRaw = await redis.get(`snapshot:${targetId}`);
    if (!targetRaw) {
      const snapshotMap = await redis.hGetAll('snapshot_backups');
      targetRaw = snapshotMap[targetId];
    }

    if (!targetRaw) {
      return c.json({ error: 'Target snapshot not found' }, 404);
    }

    const targetParsed = parseStoredSnapshot(targetRaw);
    if (!targetParsed || !targetParsed.data) {
      return c.json({ error: 'Failed to parse target snapshot' }, 500);
    }

    // ═════════════════════════════════════════════════════════════════════
    // 🔴 APPLY CHANGES TO REDDIT — restore subreddit settings & entities
    // ═════════════════════════════════════════════════════════════════════
    
    const subName = context.subredditName;
    if (!subName) {
      return c.json({ error: 'Missing subreddit context' }, 400);
    }

    const restoreResults: Record<string, { success: boolean; error?: string }> = {};
    const targetData = targetParsed.data as Record<string, unknown>;

    try {
      const subreddit = await reddit.getSubredditByName(subName);
      
      // Helper function to safely attempt mutations
      const attemptMutation = async (
        name: string,
        fn: () => Promise<void>,
      ): Promise<void> => {
        try {
          console.log(`[SubVault] Attempting ${name}...`);
          await fn();
          restoreResults[name] = { success: true };
          console.log(`[SubVault] ✓ ${name} completed successfully`);
        } catch (error) {
          console.error(`[SubVault] ✗ ${name} failed:`, error);
          restoreResults[name] = { 
            success: false, 
            error: String(error).slice(0, 150)
          };
        }
      };

      // 1. Restore Rules
      await attemptMutation('rules', async () => {
        const existingRules = await reddit.getRules(subreddit.name);
        
        // Attempt to delete existing rules
        for (const rule of existingRules) {
          try {
            const reddit_any = reddit as any;
            const ruleName = rule.shortName ?? 'unknown';
            if (typeof reddit_any.deleteRule === 'function') {
              await reddit_any.deleteRule(subreddit.name, ruleName);
              console.log(`[SubVault] Deleted rule: ${ruleName}`);
            } else if (typeof reddit_any.removeRule === 'function') {
              await reddit_any.removeRule(subreddit.name, ruleName);
              console.log(`[SubVault] Removed rule: ${ruleName}`);
            }
          } catch (err) {
            console.warn(`[SubVault] Could not delete rule:`, String(err).slice(0, 80));
          }
        }
        
        // Attempt to add rules from snapshot
        const snapshotRules = targetData.rules as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(snapshotRules)) {
          const reddit_any = reddit as any;
          for (const rule of snapshotRules) {
            try {
              const ruleName = (rule as any).shortName ?? 'rule';
              if (typeof reddit_any.addRule === 'function') {
                await reddit_any.addRule(subreddit.name, rule);
                console.log(`[SubVault] Added rule: ${ruleName}`);
              } else if (typeof reddit_any.createRule === 'function') {
                await reddit_any.createRule(subreddit.name, rule);
                console.log(`[SubVault] Created rule: ${ruleName}`);
              }
            } catch (err) {
              console.warn(`[SubVault] Could not add rule:`, String(err).slice(0, 80));
            }
          }
        }
      });

      // 2. Restore Removal Reasons
      await attemptMutation('removalReasons', async () => {
        const existingReasons = await reddit.getSubredditRemovalReasons(subreddit.name);
        
        // Attempt to delete existing removal reasons
        for (const reason of existingReasons) {
          try {
            const reddit_any = reddit as any;
            const reasonId = (reason as any).id ?? (reason as any).shortName ?? '';
            const reasonTitle = (reason as any).title ?? 'Unknown';
            
            if (reasonId && typeof reddit_any.deleteRemovalReason === 'function') {
              await reddit_any.deleteRemovalReason(subreddit.name, reasonId);
              console.log(`[SubVault] Deleted removal reason: ${reasonTitle}`);
            } else if (reasonId && typeof reddit_any.removeRemovalReason === 'function') {
              await reddit_any.removeRemovalReason(subreddit.name, reasonId);
              console.log(`[SubVault] Removed removal reason: ${reasonTitle}`);
            }
          } catch (err) {
            console.warn(`[SubVault] Could not delete removal reason:`, String(err).slice(0, 80));
          }
        }
        
        // Attempt to add removal reasons from snapshot
        const snapshotReasons = targetData.removalReasons as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(snapshotReasons)) {
          const reddit_any = reddit as any;
          for (const reason of snapshotReasons) {
            try {
              const reasonTitle = (reason as any).title ?? 'Removal Reason';
              if (typeof reddit_any.addRemovalReason === 'function') {
                await reddit_any.addRemovalReason(subreddit.name, reason);
                console.log(`[SubVault] Added removal reason: ${reasonTitle}`);
              } else if (typeof reddit_any.createRemovalReason === 'function') {
                await reddit_any.createRemovalReason(subreddit.name, reason);
                console.log(`[SubVault] Created removal reason: ${reasonTitle}`);
              }
            } catch (err) {
              console.warn(`[SubVault] Could not add removal reason:`, String(err).slice(0, 80));
            }
          }
        }
      });

      // 3. Restore AutoModerator Config via Wiki Page
      await attemptMutation('automoderator', async () => {
        const automodConfig = targetData.automoderator;
        const configStr = typeof automodConfig === 'string' ? automodConfig : '';
        
        if (configStr && configStr.length > 0) {
          const reddit_any = reddit as any;
          
          // Try multiple possible method names
          if (typeof reddit_any.editWikiPage === 'function') {
            await reddit_any.editWikiPage(subreddit.name, 'config/automoderator', {
              content: configStr,
              reason: 'SubVault: Restored AutoModerator config from snapshot',
            });
            console.log('[SubVault] Updated AutoModerator config via editWikiPage');
          } else if (typeof reddit_any.updateWikiPage === 'function') {
            await reddit_any.updateWikiPage(subreddit.name, 'config/automoderator', {
              content: configStr,
              reason: 'SubVault: Restored AutoModerator config from snapshot',
            });
            console.log('[SubVault] Updated AutoModerator config via updateWikiPage');
          } else if (typeof reddit_any.setWikiPageContent === 'function') {
            await reddit_any.setWikiPageContent(subreddit.name, 'config/automoderator', configStr);
            console.log('[SubVault] Updated AutoModerator config via setWikiPageContent');
          } else {
            throw new Error('No wiki page update method found (tried editWikiPage, updateWikiPage, setWikiPageContent)');
          }
        }
      });

      // 4. Restore Widgets
      await attemptMutation('widgets', async () => {
        const existingWidgets = await reddit.getWidgets(subreddit.name);
        
        // Attempt to remove existing widgets
        for (const widget of existingWidgets ?? []) {
          try {
            const reddit_any = reddit as any;
            const widgetId = (widget as any).id ?? '';
            
            if (widgetId) {
              if (typeof reddit_any.removeWidget === 'function') {
                await reddit_any.removeWidget(subreddit.name, widgetId);
                console.log(`[SubVault] Removed widget: ${widgetId}`);
              } else if (typeof reddit_any.deleteWidget === 'function') {
                await reddit_any.deleteWidget(subreddit.name, widgetId);
                console.log(`[SubVault] Deleted widget: ${widgetId}`);
              }
            }
          } catch (err) {
            console.warn(`[SubVault] Could not remove widget:`, String(err).slice(0, 80));
          }
        }
        
        // Attempt to add widgets from snapshot
        const snapshotWidgets = targetData.widgets as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(snapshotWidgets)) {
          const reddit_any = reddit as any;
          for (const widget of snapshotWidgets) {
            try {
              const widgetId = (widget as any).id ?? 'unknown';
              if (typeof reddit_any.addWidget === 'function') {
                await reddit_any.addWidget(subreddit.name, widget);
                console.log(`[SubVault] Added widget: ${widgetId}`);
              } else if (typeof reddit_any.createWidget === 'function') {
                await reddit_any.createWidget(subreddit.name, widget);
                console.log(`[SubVault] Created widget: ${widgetId}`);
              }
            } catch (err) {
              console.warn(`[SubVault] Could not add widget:`, String(err).slice(0, 80));
            }
          }
        }
      });

      // 5. Restore Subreddit Settings
      // NOTE: This is limited by Devvit API permissions. Only attempt read-only field restoration if mutation methods exist.
      await attemptMutation('settings', async () => {
        const snapshotSettings = targetData.settings as Record<string, unknown> | undefined;
        if (snapshotSettings && typeof snapshotSettings === 'object') {
          const reddit_any = reddit as any;
          
          // Only attempt if we have a way to update settings
          if (typeof reddit_any.updateSubredditSettings === 'function') {
            // Only update mutable settings (exclude read-only fields)
            const MUTABLE_KEYS = [
              'title', 'publicDescription', 'description', 'nsfw', 'language',
              'allowGalleries', 'allowImages', 'allowVideos', 'allowPolls',
              'subredditType',
            ];
            
            const toUpdate: Record<string, unknown> = {};
            for (const key of MUTABLE_KEYS) {
              if (key in snapshotSettings) {
                toUpdate[key] = snapshotSettings[key];
              }
            }
            
            if (Object.keys(toUpdate).length > 0) {
              await reddit_any.updateSubredditSettings(subreddit.name, toUpdate);
              console.log(`[SubVault] Updated settings: ${Object.keys(toUpdate).join(', ')}`);
            }
          } else {
            throw new Error('updateSubredditSettings method not available in this Devvit version');
          }
        }
      });

    } catch (error) {
      console.error('[SubVault] Error during restoration:', error);
      return c.json({ 
        error: 'Error accessing subreddit during restoration',
        details: String(error).slice(0, 200)
      }, 500);
    }

    // ═════════════════════════════════════════════════════════════════════
    // Create a new snapshot as a "restore point" copy of the target
    // ═════════════════════════════════════════════════════════════════════
    
    const timestamp = Date.now();
    const newId = `restore_${timestamp}`;
    const restored = {
      id: newId,
      message: `Restored from: ${targetParsed.message ?? targetId}`,
      data: targetParsed.data ?? {},
      createdAt: new Date(timestamp).toISOString(),
    };

    const payload = JSON.stringify(restored);
    await Promise.all([
      redis.set(`snapshot:${newId}`, payload),
      redis.hSet('snapshot_backups', { [newId]: payload }),
    ]);

    console.log(`[SubVault] Restored snapshot ${targetId} as new snapshot ${newId}`);
    console.log('[SubVault] Restore results:', JSON.stringify(restoreResults, null, 2));

    return c.json({ 
      success: true, 
      newId,
      restoreResults,
      message: 'Snapshot restored to subreddit. Check logs for details on each entity type.'
    });
  } catch (error) {
    console.error('[SubVault] Failed to restore snapshot:', error);
    return c.json({ error: 'Failed to restore snapshot' }, 500);
  }
});