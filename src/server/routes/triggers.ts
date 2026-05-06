import { Hono } from 'hono';
import type {
  OnAppInstallRequest,
  OnModActionRequest,
  TriggerResponse,
} from '@devvit/web/shared';
import { context, reddit, redis } from '@devvit/web/server';
import { createPost } from '../core/post';

export const triggers = new Hono();

const MOD_ACTIONS_TO_TRACK = new Set([
  'community_settings',
  'wiki_revise',
  'create_rule',
  'edit_rule',
  'delete_rule',
  'create_post_flair',
  'edit_post_flair',
  'delete_post_flair',
  'create_removal_reason',
  'edit_removal_reason',
  'delete_removal_reason',
]);

const ACTION_LABELS: Record<string, string> = {
  community_settings: 'Community Settings changed',
  wiki_revise: 'Automod YAML updated',
  create_rule: 'Rule created',
  edit_rule: 'Rule edited',
  delete_rule: 'Rule deleted',
  create_post_flair: 'Post flair created',
  edit_post_flair: 'Post flair edited',
  delete_post_flair: 'Post flair deleted',
  create_removal_reason: 'Removal reason created',
  edit_removal_reason: 'Removal reason edited',
  delete_removal_reason: 'Removal reason deleted',
};

type StoredSnapshot = {
  id: string;
  message: string;
  data: {
    rules: unknown;
    settings: unknown | null;
    postFlairs: unknown;
    userFlairs?: unknown;
    widgets?: unknown | null;
    removalReasons?: unknown;
    automoderator: string;
    eventContext: {
      action: string;
      targetId: string | undefined;
    };
  };
  createdAt: string;
};

triggers.post('/on-app-install', async (c) => {
  try {
    const post = await createPost();
    const input = await c.req.json<OnAppInstallRequest>();

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Post created in subreddit ${context.subredditName} with id ${post.id} (trigger: ${input.type})`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to create post',
      },
      400
    );
  }
});

triggers.post('/on-mod-action', async (c) => {
  const input = await c.req.json<OnModActionRequest>();
  const action = input.action ?? 'unknown_action';
  const moderator = input.moderator?.name ?? 'Unknown Moderator';
  const targetId = input.targetPost?.id ?? input.targetComment?.id;

  console.log(
    `[SubVault] ModAction received action=${action} moderator=${moderator} target=${targetId ?? 'none'} subreddit=${context.subredditName ?? 'unknown'}`
  );

  if (!MOD_ACTIONS_TO_TRACK.has(action)) {
    console.log(`[SubVault] Ignoring untracked ModAction action=${action}`);
    return c.json<TriggerResponse>({}, 200);
  }

  const timestamp = Date.now();
  const id = `auto_${timestamp}`;
  const label = ACTION_LABELS[action] ?? action;

  console.log(
    `[SubVault] Tracked ModAction detected action=${action} label="${label}" snapshot=${id} - fetching live subreddit context`
  );

  try {
    const subredditName = context.subredditName;

    // Safe fetch wrapper: ensures one failing call doesn't reject the whole snapshot
    const safeFetch = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        console.warn('[SubVault] safeFetch fallback due to error:', String(err));
        return fallback;
      }
    };

    // Fetch a broad set of subreddit data concurrently, with fallbacks
    const [
      rules,
      info,
      postFlairs,
      userFlairs,
      widgets,
      removalReasons,
    ] = await Promise.all([
      safeFetch(() => reddit.getRules(subredditName), []),
      safeFetch(() => reddit.getSubredditInfoByName(subredditName), null),
      safeFetch(() => reddit.getPostFlairTemplates(subredditName), []),
      safeFetch(() => reddit.getUserFlairTemplates(subredditName), []),
      safeFetch(() => reddit.getWidgets(subredditName), null),
      safeFetch(() => reddit.getSubredditRemovalReasons(subredditName), []),
    ]);

    // Automod wiki fetch may 404 — keep separate try/catch for clarity
    let automod = 'Not configured';
    try {
      const automodWiki = await reddit.getWikiPage(subredditName, 'config/automoderator');
      automod = automodWiki.content;
    } catch (error) {
      console.log(`[SubVault] Automoderator wiki unavailable snapshot=${id}; continuing.`);
    }

    const snapshot: StoredSnapshot = {
      id,
      message: `Auto-Backup: ${label} - Triggered by ${moderator} via ModAction`,
      data: {
        rules: rules ?? [],
        settings: info ?? null,
        postFlairs,
        userFlairs,
        widgets,
        removalReasons,
        automoderator: automod,
        eventContext: { action, targetId },
      },
      createdAt: new Date(timestamp).toISOString(),
    };

    // Avoid hitting per-value size limits: warn if payload is large and store truncated automod as needed
    const payloadStr = JSON.stringify(snapshot);
    const sizeBytes = typeof Buffer !== 'undefined' ? Buffer.byteLength(payloadStr, 'utf8') : payloadStr.length;
    if (sizeBytes > 100 * 1024) {
      console.warn(`[SubVault] Snapshot payload ${id} is large (${sizeBytes} bytes). Truncating automod and widgets for storage.`);
      // Truncate automod and widgets to keep payload smaller
      const truncatedSnapshot = { ...snapshot } as StoredSnapshot;
      if (truncatedSnapshot.data && typeof truncatedSnapshot.data.automoderator === 'string') {
        truncatedSnapshot.data.automoderator = (truncatedSnapshot.data.automoderator as string).slice(0, 90 * 1024);
      }
      if (truncatedSnapshot.data) {
        truncatedSnapshot.data.widgets = null;
      }
      const serializedTruncated = JSON.stringify(truncatedSnapshot);
      await Promise.all([
        redis.set(`snapshot:${id}`, serializedTruncated),
        redis.hSet('snapshot_backups', { [id]: serializedTruncated }),
      ]);
    } else {
      await Promise.all([
        redis.set(`snapshot:${id}`, payloadStr),
        redis.hSet('snapshot_backups', { [id]: payloadStr }),
      ]);
    }

    console.log(`[SubVault] Auto snapshot saved successfully snapshot=${id} size=${sizeBytes}`);
    return c.json<TriggerResponse>({}, 200);
  } catch (error) {
    console.error(
      `[SubVault] Failed to fetch or save auto snapshot for action=${action}:`,
      error
    );
    return c.json<TriggerResponse>({}, 200);
  }
});
