/**
 * src/server/scripts/apply-settings.ts
 *
 * Applies a full subreddit settings payload to the live subreddit.
 * Add a POST route to trigger it, or call applySettings() directly.
 *
 * Usage — add to src/server/index.ts:
 *   import { applySettingsRoute } from './scripts/apply-settings';
 *   app.route('/api/apply-settings', applySettingsRoute);
 *
 * Then POST /api/apply-settings  (no body required — payload is inlined below).
 */

import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';

// ─── Example payload ──────────────────────────────────────────────────────────
// Edit any value here; when the route is called these become the live values.

const TARGET_SETTINGS = {
  // ── Appearance (Devvit can write these) ──────────────────────────────────
  primaryColor: '#11FF00',        // writable theme color
  legacyPrimaryColor: '#44FF00',  // kept as fallback if primaryColor is blank
  highlightColor: '#051AFA',      // writable banner background color
  backgroundColor: '#FB0404',     // not writable via updateSettings()

  // Banner / icon images — updateSettings() accepts these on the subreddit type.
  icon: 'https://styles.redditmedia.com/t5_hste7g/styles/communityIcon_fy1do140vg0h1.png?width=64&height=64&frame=1&auto=webp&crop=64:64,smart&s=f6488a93bef0cb5cfa066e9789aaac11087e6a32',
  bannerBackgroundImage: 'https://styles.redditmedia.com/t5_hste7g/styles/bannerBackgroundImage_97qvo140vg0h1.png',
  mobileBannerImage: 'https://styles.redditmedia.com/t5_hste7g/styles/mobileBannerImage_b5noo140vg0h1.png',

  // ── Identity ─────────────────────────────────────────────────────────────
  title: 'testAdarsh2',
  description: '2',

  // ── Community type ────────────────────────────────────────────────────────
  subredditType: 'private' as 'public' | 'private' | 'restricted',
  nsfw: true,

  // ── Posting & interaction controls ────────────────────────────────────────
  isPostingRestricted: true,
  isCommentingRestricted: false,
  isCrosspostingAllowed: true,
  isArchivePostsEnabled: false,
  isDiscoveryAllowed: true,
  isSpoilerAvailable: true,
  isChatPostCreationAllowed: false,
  isChatPostFeatureEnabled: false,
  isEmojisEnabled: false,

  // ── Predictions ───────────────────────────────────────────────────────────
  isPredictionAllowed: false,
  isPredictionsTournamentAllowed: false,
  isPredictionContributorsAllowed: false,

  // ── Flairs ────────────────────────────────────────────────────────────────
  authorFlairEnabled: true,
  authorFlairSelfAssignable: false,
  postFlairEnabled: false,
  postFlairSelfAssignable: false,

  // ── Wiki ──────────────────────────────────────────────────────────────────
  wikiEditMode: 'DISABLED' as 'DISABLED' | 'MODERATORS' | 'ALL_USERS',
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeHex(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const raw = v.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return `#${raw.toLowerCase()}`;
}

type Result = { success: boolean; skipped?: boolean; error?: string; detail?: string };

function makeSkippedResult(detail: string): Result {
  return { success: true, skipped: true, detail };
}

// ─── Core apply function ──────────────────────────────────────────────────────

export async function applySettings(subredditName: string): Promise<Record<string, Result>> {
  const results: Record<string, Result> = {};
  const subreddit = await reddit.getSubredditByName(subredditName);

  // ── 1. Identity + community settings ──────────────────────────────────────
  try {
    type UpdateSettings = Parameters<typeof subreddit.updateSettings>[0];
    const communityUpdate: UpdateSettings = {};

    if (TARGET_SETTINGS.title)       communityUpdate.title       = TARGET_SETTINGS.title;
    if (TARGET_SETTINGS.description) communityUpdate.description = TARGET_SETTINGS.description;

    communityUpdate.restrictPosting    = TARGET_SETTINGS.isPostingRestricted;
    communityUpdate.restrictCommenting = TARGET_SETTINGS.isCommentingRestricted;
    communityUpdate.crosspostable      = TARGET_SETTINGS.isCrosspostingAllowed;
    communityUpdate.shouldArchivePosts = TARGET_SETTINGS.isArchivePostsEnabled;
    communityUpdate.allowDiscovery     = TARGET_SETTINGS.isDiscoveryAllowed;
    communityUpdate.spoilersEnabled    = TARGET_SETTINGS.isSpoilerAvailable;
    communityUpdate.allowChatPostCreation = TARGET_SETTINGS.isChatPostCreationAllowed;
    communityUpdate.chatPostEnabled    = TARGET_SETTINGS.isChatPostFeatureEnabled;
    communityUpdate.emojisEnabled      = TARGET_SETTINGS.isEmojisEnabled;
    communityUpdate.allowPredictions   = TARGET_SETTINGS.isPredictionAllowed;
    communityUpdate.allowPredictionsTournament  = TARGET_SETTINGS.isPredictionsTournamentAllowed;
    communityUpdate.allowPredictionContributors = TARGET_SETTINGS.isPredictionContributorsAllowed;

    communityUpdate.userFlairs = {
      enabled:        TARGET_SETTINGS.authorFlairEnabled,
      usersCanAssign: TARGET_SETTINGS.authorFlairSelfAssignable,
    };
    communityUpdate.postFlairs = {
      enabled:        TARGET_SETTINGS.postFlairEnabled,
      usersCanAssign: TARGET_SETTINGS.postFlairSelfAssignable,
    };

    communityUpdate.wikiEnabled =
      TARGET_SETTINGS.wikiEditMode.toUpperCase() !== 'DISABLED';

    await subreddit.updateSettings(communityUpdate);
    results['communitySettings'] = {
      success: true,
      detail: `Updated ${Object.keys(communityUpdate).length} fields`,
    };
  } catch (err) {
    results['communitySettings'] = { success: false, error: String(err).slice(0, 300) };
  }

  // ── 2. Appearance / theme colour ──────────────────────────────────────────
  // Only write the supported fields from the local SubredditSettings contract.
  const themeColor =
    normalizeHex(TARGET_SETTINGS.primaryColor) ??
    normalizeHex(TARGET_SETTINGS.legacyPrimaryColor);

  try {
    type UpdateSettings = Parameters<typeof subreddit.updateSettings>[0];
    const appearanceUpdate: UpdateSettings = {};

    if (themeColor) {
      appearanceUpdate.keyColor = themeColor;
      appearanceUpdate.primaryColor = themeColor;
    }

    const highlightColor = normalizeHex(TARGET_SETTINGS.highlightColor);
    if (highlightColor) {
      appearanceUpdate.bannerBackgroundColor = highlightColor;
    }

    if (TARGET_SETTINGS.icon) {
      appearanceUpdate.communityIcon = TARGET_SETTINGS.icon;
    }

    if (TARGET_SETTINGS.bannerBackgroundImage) {
      appearanceUpdate.bannerBackgroundImage = TARGET_SETTINGS.bannerBackgroundImage;
    }

    if (TARGET_SETTINGS.mobileBannerImage) {
      appearanceUpdate.mobileBannerImage = TARGET_SETTINGS.mobileBannerImage;
    }

    if (Object.keys(appearanceUpdate).length > 0) {
      await subreddit.updateSettings(appearanceUpdate);
      results['appearance'] = {
        success: true,
        detail: `Updated ${Object.keys(appearanceUpdate).length} appearance fields`,
      };
    } else {
      results['appearance'] = { success: true, skipped: true, detail: 'No valid appearance fields found' };
    }
  } catch (err) {
    results['appearance'] = { success: false, error: String(err).slice(0, 300) };
  }

  // ── 3. Fields that are not written by this route ──────────────────────────
  results['backgroundColor'] = makeSkippedResult('Not writable through updateSettings(); keep changing this manually in mod tools → appearance.');
  results['subredditType'] = makeSkippedResult('Not written here; subreddit type is not part of the confirmed updateSettings payload.');
  results['nsfw'] = makeSkippedResult('Not written here; subreddit NSFW state is not part of the confirmed updateSettings payload.');

  return results;
}

// ─── Hono route ───────────────────────────────────────────────────────────────

export const applySettingsRoute = new Hono();

applySettingsRoute.post('/', async (c) => {
  const subName = context.subredditName;
  if (!subName) return c.json({ error: 'Missing subreddit context' }, 400);

  console.log(`[SubVault] applySettings triggered for r/${subName}`);

  const results = await applySettings(subName);

  const anyFailed = Object.values(results).some(r => !r.success);
  const appliedCount = Object.values(results).filter(r => r.success && !r.skipped).length;
  const skippedCount = Object.values(results).filter(r => r.skipped).length;

  console.log('[SubVault] applySettings results:', JSON.stringify(results, null, 2));

  return c.json({
    success: !anyFailed,
    summary: `${appliedCount} sections applied, ${skippedCount} skipped`,
    results,
  }, anyFailed ? 207 : 200);
});