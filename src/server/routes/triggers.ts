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
  'wikirevise',
  'wikipagelisted',
  'wikibanned',
  'wikiunbanned',
  'approvelink',
  'removelink',
  'approvecomment',
  'removecomment',
  'banuser',
  'unbanuser',
  'muteuser',
  'unmuteuser',
  'addmoderator',
  'invitemoderator',
  'removemoderator',
  'acceptmoderatorinvite',
  'sticky',
  'unsticky',
  'distinguish',
  'marknsfw',
  'unmarknsfw',
  'spoiler',
  'unspoiler',
  'lock',
  'unlock',
  'addcontributor',
  'removecontributor',
]);

const ACTION_LABELS: Record<string, string> = {
  community_settings: 'Community Settings changed',
  wiki_revise: 'Wiki page updated',
  wikirevise: 'Wiki page updated',
  create_rule: 'Rule created',
  edit_rule: 'Rule edited',
  delete_rule: 'Rule deleted',
  create_post_flair: 'Post flair created',
  edit_post_flair: 'Post flair edited',
  delete_post_flair: 'Post flair deleted',
  create_removal_reason: 'Removal reason created',
  edit_removal_reason: 'Removal reason edited',
  delete_removal_reason: 'Removal reason deleted',
  banuser: 'User banned',
  unbanuser: 'User unbanned',
  muteuser: 'User muted',
  unmuteuser: 'User unmuted',
  addmoderator: 'Moderator added',
  removemoderator: 'Moderator removed',
  approvelink: 'Post approved',
  removelink: 'Post removed',
  approvecomment: 'Comment approved',
  removecomment: 'Comment removed',
  sticky: 'Post stickied',
  unsticky: 'Post unstickied',
  lock: 'Thread locked',
  unlock: 'Thread unlocked',
  marknsfw: 'Marked NSFW',
  unmarknsfw: 'Unmarked NSFW',
  addcontributor: 'Approved user added',
  removecontributor: 'Approved user removed',
};

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
      const permissions = (mod as unknown as Record<string, unknown>).permissions ?? [];
      listing.push({ username: mod.username, permissions });
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

// Safe fetch wrapper
const safeFetch = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    console.warn('[SubVault] safeFetch fallback:', String(err).slice(0, 100));
    return fallback;
  }
};

export async function captureFullCommunitySnapshot(subredditName: string) {
  console.log(`[SubVault] Fetching full community snapshot for r/${subredditName}`);

  // Fetch all available data concurrently with safe fallbacks
  const [
    rulesResult,
    infoResult,
    postFlairsResult,
    userFlairsResult,
    widgetsResult,
    removalReasonsResult,
    wikiPagesResult,
    bannedUsersResult,
    mutedUsersResult,
    approvedUsersResult,
    moderatorsResult,
  ] = await Promise.all([
    // Rules
    safeFetch(() => reddit.getRules(subredditName), []),
    // Subreddit info (type, nsfw, description, title, etc.)
    safeFetch(() => reddit.getSubredditInfoByName(subredditName), null),
    // Post flair templates
    safeFetch(() => reddit.getPostFlairTemplates(subredditName), []),
    // User flair templates
    safeFetch(() => reddit.getUserFlairTemplates(subredditName), []),
    // Sidebar widgets
    safeFetch(() => reddit.getWidgets(subredditName), null),
    // Removal reasons
    safeFetch(() => reddit.getSubredditRemovalReasons(subredditName), []),
    // Wiki pages list
    safeFetch(() => reddit.getWikiPages(subredditName), []),
    // Banned users (first page)
    safeFetch(async () => {
      const listing = reddit.getBannedUsers({ subredditName, limit: 100 });
      const users = [];
      for await (const u of listing) {
        users.push({ username: u.username, note: (u as unknown as Record<string, unknown>).banNote ?? '' });
        if (users.length >= 100) break;
      }
      return users;
    }, []),
    // Muted users
    safeFetch(async () => {
      const listing = reddit.getMutedUsers({ subredditName, limit: 100 });
      const users = [];
      for await (const u of listing) {
        users.push({ username: u.username });
        if (users.length >= 100) break;
      }
      return users;
    }, []),
    // Approved (contributor) users
    safeFetch(async () => {
      const listing = reddit.getApprovedUsers({ subredditName, limit: 100 });
      const users = [];
      for await (const u of listing) {
        users.push({ username: u.username });
        if (users.length >= 100) break;
      }
      return users;
    }, []),
    // Moderators
    safeFetch(async () => {
      const listing = reddit.getModerators({ subredditName });
      const mods = [];
      for await (const m of listing) {
        mods.push({ username: m.username, permissions: (m as unknown as Record<string, unknown>).permissions ?? [] });
        if (mods.length >= 100) break;
      }
      return mods;
    }, []),
  ]);

  // Automod wiki — separate because it 404s if not configured
  let automodConfig = 'Not configured';
  try {
    await ensureWikiReadAccess(subredditName);
    const resolvedPage = resolveAutomodPageName(wikiPagesResult) ?? DEFAULT_AUTOMOD_PAGE;
    const automodWiki = await reddit.getWikiPage(subredditName, resolvedPage);
    automodConfig = automodWiki.content;
    // Only warn if we successfully fetched but got empty content (not the "Not configured" state)
    if (automodConfig.length === 0) {
      console.warn('[SubVault] ⚠️ Automod config is empty for "' + resolvedPage + '" — this subreddit has no rules configured');
    }
  } catch (err) {
    const errMsg = String(err);
    if (errMsg.includes('wiki moderator permission')) {
      throw err;
    }
    if (errMsg.includes('404') || errMsg.includes('Not Found')) {
      console.log('[SubVault] No automoderator config found (404).');
    } else {
      console.warn('[SubVault] Warning: Failed to fetch automod config (trigger):', errMsg.slice(0, 150));
    }
  }

  // Subreddit settings (content controls, safety filters, etc.)
  let subredditSettings: Record<string, unknown> | null = null;
  try {
    const settings = await reddit.getSubredditStyles(context.subredditId);
    subredditSettings = settings as unknown as Record<string, unknown>;
  } catch (err) {
    console.warn('[SubVault] Could not fetch subreddit settings:', String(err).slice(0, 100));
  }

  // Build identity block from info

  const identity = infoResult
    ? (() => {
        const info = infoResult as Record<string, never>;
        // Some API shapes use `over18` for NSFW, others use `nsfw`.
        const nsfwFlag = typeof info.over18 === 'boolean' ? info.over18 : info.nsfw ?? false;
        return {
          displayName: info.name ?? subredditName,
          title: info.title ?? '',
          description: info.description ?? '',
          publicDescription: info.publicDescription ?? '',
          subredditType: info.subredditType ?? '',
          nsfw: nsfwFlag,
          subscribers: info.subscribers ?? 0,
          createdAt: info.createdAt ?? '',
          url: info.url ?? '',
          lang: info.lang ?? 'en',
          allowGalleries: info.allowGalleries ?? null,
          allowImages: info.allowImages ?? null,
          allowVideos: info.allowVideos ?? null,
          allowPolls: info.allowPolls ?? null,
          communityIcon: info.communityIcon ?? '',
          bannerBackgroundImage: info.bannerBackgroundImage ?? '',
          bannerImg: info.bannerImg ?? '',
          keyColor: info.keyColor ?? '',
          primaryColor: info.primaryColor ?? '',
          iconColor: info.iconColor ?? '',
        };
      })()
    : null;

  // Ensure theme color is present in settings for restore/verification.
  // `getSubredditStyles()` often returns theme under different keys.
  const normalizeHexColor = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const raw = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
    return `#${raw.toLowerCase()}`;
  };

  const themeColor = normalizeHexColor((infoResult as any)?.keyColor) ?? normalizeHexColor((infoResult as any)?.primaryColor);
  if (themeColor) {
    subredditSettings = subredditSettings ?? {};
    subredditSettings['keyColor'] = themeColor;
    subredditSettings['primaryColor'] = themeColor;
  }

  return {
    identity,
    settings: subredditSettings,
    rules: rulesResult ?? [],
    removalReasons: removalReasonsResult ?? [],
    flairs: {
      post: postFlairsResult ?? [],
      user: userFlairsResult ?? [],
    },
    widgets: widgetsResult,
    automoderator: automodConfig,
    wikiPages: wikiPagesResult ?? [],
    userManagement: {
      banned: bannedUsersResult,
      muted: mutedUsersResult,
      approved: approvedUsersResult,
      moderators: moderatorsResult,
    },
    capturedAt: new Date().toISOString(),
    limitations: {
      cssStylesheet: 'Not available via Devvit API',
      emojis: 'Not available via Devvit API',
      chatChannels: 'Not available via Devvit API',
      modNotes: 'Not available via Devvit API',
      safetyFilters: 'Not directly exposed via Devvit API — partially in settings',
      banEventsHistory: 'Not available via Devvit API',
    },
  };
}

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
      { status: 'error', message: 'Failed to create post' },
      400
    );
  }
});

triggers.post('/on-mod-action', async (c) => {
  const input = await c.req.json<OnModActionRequest>();
  const action = input.action ?? 'unknown_action';
  const moderator = input.moderator?.name ?? 'Unknown Moderator';
  const targetId = input.targetPost?.id ?? input.targetComment?.id;

  console.log(`[SubVault] ModAction action=${action} moderator=${moderator}`);

  if (!MOD_ACTIONS_TO_TRACK.has(action)) {
    console.log(`[SubVault] Ignoring untracked action=${action}`);
    return c.json<TriggerResponse>({}, 200);
  }

  // Skip auto-snapshot if a restore is currently propagating changes to Reddit
  const subredditName = context.subredditName;
  const restoreInProgress = await safeFetch(() => redis.get(`restore_in_progress:${subredditName}`), null);
  if (restoreInProgress === 'true') {
    console.log(`[SubVault] Skipping auto-snapshot — restore in progress for r/${subredditName}`);
    return c.json<TriggerResponse>({}, 200);
  }

  const timestamp = Date.now();
  const id = `auto_${timestamp}`;
  const label = ACTION_LABELS[action] ?? action;

  try {
    const subredditName = context.subredditName;
    const communityData = await captureFullCommunitySnapshot(subredditName);

    const snapshot = {
      id,
      message: `Auto-Backup: ${label} — by ${moderator}`,
      data: {
        ...communityData,
        eventContext: { action, label, targetId, moderator },
      },
      createdAt: new Date(timestamp).toISOString(),
    };

    let payloadStr = JSON.stringify(snapshot);
    const sizeBytes = payloadStr.length;

    // If over 95KB, truncate automod first, then remove banned users list
    if (sizeBytes > 95 * 1024) {
      console.warn(`[SubVault] Payload too large (${sizeBytes}B), truncating...`);
      snapshot.data.automoderator = snapshot.data.automoderator.slice(0, 10000) + '\n... [truncated]';
      snapshot.data.userManagement.banned = snapshot.data.userManagement.banned.slice(0, 20);
      snapshot.data.userManagement.approved = snapshot.data.userManagement.approved.slice(0, 20);
      payloadStr = JSON.stringify(snapshot);
    }

    await Promise.all([
      redis.set(`snapshot:${id}`, payloadStr),
      redis.hSet('snapshot_backups', { [id]: payloadStr }),
    ]);

    console.log(`[SubVault] Auto snapshot saved id=${id} size=${payloadStr.length}B`);
    return c.json<TriggerResponse>({}, 200);
  } catch (error) {
    console.error(`[SubVault] Failed to save auto snapshot:`, error);
    return c.json<TriggerResponse>({}, 200);
  }
});