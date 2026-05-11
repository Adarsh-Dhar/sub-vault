import { Hono } from 'hono';
import { context, redis, reddit, settings } from '@devvit/web/server';
import { computeSnapshotDiff } from '../../shared/snapshot-diff';

export const snapshot = new Hono();

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_AUTOMOD_PAGE = 'config/automoderator';
const AUTOMOD_CANDIDATES = ['config/automoderator', 'automoderator'] as const;
const VERIFICATION_MAX_ATTEMPTS = 18;
const VERIFICATION_POLL_INTERVAL_MS = 10_000;
const POLLING_SESSION_TTL_SECONDS = 60 * 30;

// ─── Types ────────────────────────────────────────────────────────────────────

type SnapshotStatus = 'success' | 'warning' | 'error';

type SnapshotListItem = {
  id: string;
  author: string;
  hash: string;
  message: string;
  timestamp: string;
  changes: number;
  status: SnapshotStatus;
};

type StoredSnapshot = {
  id: string;
  message: string;
  data: Record<string, unknown>;
  createdAt: string;
};

type VerificationSection = {
  section: string;
  additions: number;
  deletions: number;
  status: 'matched' | 'drifted' | 'skipped';
};

type VerificationResult = {
  sectionsChanged: number;
  totalAdditions: number;
  totalDeletions: number;
  sections: VerificationSection[];
  verifiedAt: string;
  verified: boolean;
  notes: string[];
};

type PollingSession = {
  pollingId: string;
  restoreId: string;
  targetId: string;
  subName: string;
  currentAttempt: number;
  maxAttempts: number;
  isActive: boolean;
  verified: boolean;
  timedOut: boolean;
  lastAttemptAt?: string;
  lastVerification?: VerificationResult | null;
  createdAt: string;
  completedAt?: string;
};

// ─── Small Utilities ──────────────────────────────────────────────────────────

async function safeFetch<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn('[SubVault] safeFetch fallback:', String(err).slice(0, 120));
    return fallback;
  }
}

function extractString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    return v.map(extractString).filter(Boolean).join('\n').trim();
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const key of ['markdown', 'text', 'plainText', 'content', 'value', 'body']) {
      if (key in o) {
        const result = extractString(o[key]);
        if (result) return result;
      }
    }
    for (const val of Object.values(o)) {
      const result = extractString(val);
      if (result) return result;
    }
  }
  return '';
}

function resolveAutomodPage(wikiPages: unknown): string | null {
  const pages = Array.isArray(wikiPages) ? wikiPages.map(String) : [];
  const normalized = new Map(pages.map(p => [p.trim().toLowerCase(), p]));
  for (const candidate of AUTOMOD_CANDIDATES) {
    const found = normalized.get(candidate);
    if (found) return found;
  }
  return null;
}

function normalizeAutomodContent(value: unknown): string {
  const content = extractString(value).trim();
  return content.length > 0 ? content : 'Not configured';
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const raw = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return `#${raw.toLowerCase()}`;
}

function resolveThemeColor(
  settingsData: Record<string, unknown> | null | undefined,
  identityData: Record<string, unknown> | null | undefined,
): string | null {
  const candidates: unknown[] = [
    settingsData?.['keyColor'],
    settingsData?.['primaryColor'],
    settingsData?.['mobileKeyColor'],
    settingsData?.['legacyPrimaryColor'],
    identityData?.['keyColor'],
    identityData?.['primaryColor'],
  ];

  for (const c of candidates) {
    const normalized = normalizeHexColor(c);
    if (normalized) return normalized;
  }
  return null;
}

function getThemeColorCandidates(
  settingsData: Record<string, unknown> | null | undefined,
  identityData: Record<string, unknown> | null | undefined,
): string[] {
  const candidates: unknown[] = [
    settingsData?.['keyColor'],
    settingsData?.['primaryColor'],
    settingsData?.['mobileKeyColor'],
    settingsData?.['legacyPrimaryColor'],
    identityData?.['keyColor'],
    identityData?.['primaryColor'],
  ];

  const normalized = candidates
    .map(c => normalizeHexColor(c))
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  return [...new Set(normalized)];
}

function hasThemeColorMatch(
  expectedTheme: string,
  settingsData: Record<string, unknown> | null | undefined,
  identityData: Record<string, unknown> | null | undefined,
): boolean {
  const candidates = getThemeColorCandidates(settingsData, identityData);
  return candidates.includes(expectedTheme);
}

async function assertWikiAccess(subredditName: string): Promise<void> {
  const username = await safeFetch(() => reddit.getCurrentUsername(), '');
  if (!username) throw new Error('Cannot determine current Reddit account');

  const mods: Array<{ username: string; permissions: string[] }> = [];
  for await (const m of reddit.getModerators({ subredditName })) {
    mods.push({ username: m.username, permissions: (m as any).permissions ?? [] });
    if (mods.length >= 200) break;
  }

  const self = mods.find(m => m.username.toLowerCase() === username.toLowerCase());
  if (!self) throw new Error(`@${username} is not a moderator of r/${subredditName}`);

  const perms = self.permissions;
  const hasAll = perms.length === 0 || perms.some(p => ['all', 'everything', '*'].includes(p));
  const hasWiki = perms.includes('wiki');

  if (!hasAll && !hasWiki) {
    throw new Error(`@${username} needs the wiki moderator permission for r/${subredditName}`);
  }
}

// ─── Redis Helpers ────────────────────────────────────────────────────────────

function parseStoredSnapshot(raw: string): StoredSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed['id'] !== 'string') return null;
    if (typeof parsed['message'] !== 'string') return null;
    if (typeof parsed['createdAt'] !== 'string') return null;
    if (typeof parsed['data'] !== 'object' || !parsed['data']) return null;
    return {
      id: parsed['id'],
      message: parsed['message'],
      createdAt: parsed['createdAt'],
      data: parsed['data'] as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

function toListItem(snap: StoredSnapshot): SnapshotListItem {
  const digits = snap.id.replace(/\D/g, '');
  const fallbackTs = digits.length > 0
    ? new Date(parseInt(digits, 10)).toISOString()
    : new Date(0).toISOString();

  let author = 'Manual Commit';
  if (snap.message.startsWith('Restored from:')) {
    author = 'Restore';
  } else {
    const match = snap.message.match(/— by (.+)$/);
    if (match?.[1]) author = match[1];
  }

  return {
    id: snap.id,
    author,
    hash: digits.slice(-7),
    message: snap.message,
    timestamp: snap.createdAt ?? fallbackTs,
    changes: Object.keys(snap.data).length,
    status: 'success',
  };
}

async function getAllSnapshotsSorted(): Promise<StoredSnapshot[]> {
  const map = await redis.hGetAll('snapshot_backups');
  const snaps: StoredSnapshot[] = [];
  for (const raw of Object.values(map)) {
    const parsed = parseStoredSnapshot(raw);
    if (parsed) snaps.push(parsed);
  }
  snaps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return snaps;
}

async function loadSnapshot(id: string): Promise<StoredSnapshot | null> {
  const raw = await redis.get(`snapshot:${id}`) ?? (await redis.hGetAll('snapshot_backups'))[id];
  return raw ? parseStoredSnapshot(raw) : null;
}

async function saveSnapshot(snap: StoredSnapshot): Promise<void> {
  const payload = JSON.stringify(snap);
  await Promise.all([
    redis.set(`snapshot:${snap.id}`, payload),
    redis.hSet('snapshot_backups', { [snap.id]: payload }),
  ]);
}

async function readPollingSession(pollingId: string): Promise<PollingSession | null> {
  const raw = await redis.get(`polling:${pollingId}`);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<PollingSession>;
    return {
      pollingId: String(p.pollingId ?? pollingId),
      restoreId: String(p.restoreId ?? ''),
      targetId: String(p.targetId ?? ''),
      subName: String(p.subName ?? ''),
      currentAttempt: typeof p.currentAttempt === 'number' ? p.currentAttempt : 0,
      maxAttempts: typeof p.maxAttempts === 'number' ? p.maxAttempts : VERIFICATION_MAX_ATTEMPTS,
      isActive: p.isActive !== false,
      verified: p.verified === true,
      timedOut: p.timedOut === true,
      lastAttemptAt: typeof p.lastAttemptAt === 'string' ? p.lastAttemptAt : undefined,
      lastVerification: p.lastVerification ?? null,
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date().toISOString(),
      completedAt: typeof p.completedAt === 'string' ? p.completedAt : undefined,
    };
  } catch {
    return null;
  }
}

async function writePollingSession(session: PollingSession): Promise<void> {
  await redis.set(`polling:${session.pollingId}`, JSON.stringify(session));
  await redis.expire(`polling:${session.pollingId}`, POLLING_SESSION_TTL_SECONDS);
}

// ─── Devvit Settings ──────────────────────────────────────────────────────────

async function readDevvitSettings(): Promise<Record<string, unknown>> {
  const api = settings as unknown as {
    getAll?: () => Promise<Record<string, unknown>>;
    get: (key: string) => Promise<unknown>;
  };
  try {
    if (typeof api.getAll === 'function') {
      const all = await api.getAll();
      return all && typeof all === 'object' ? all : {};
    }
    const keys = ['apiKey', 'welcomeMessage', 'description', 'publicDescription'];
    const pairs = await Promise.all(keys.map(async k => [k, await api.get(k).catch(() => undefined)] as const));
    return Object.fromEntries(pairs.filter(([, v]) => v !== undefined));
  } catch (err) {
    console.warn('[SubVault] Failed to read Devvit settings:', String(err).slice(0, 200));
    return {};
  }
}

// ─── Community Snapshot Capture ───────────────────────────────────────────────

async function captureSnapshot(subName: string): Promise<Record<string, unknown>> {
  const info = await safeFetch(() => reddit.getSubredditInfoByName(subName), null) as any;

  const [rules, postFlairs, userFlairs, subredditStyles, devvitSettings] = await Promise.all([
    safeFetch(() => reddit.getRules(subName), []),
    safeFetch(() => reddit.getPostFlairTemplates(subName), []),
    safeFetch(() => reddit.getUserFlairTemplates(subName), []),
    safeFetch(() => reddit.getSubredditStyles(context.subredditId), null),
    readDevvitSettings(),
  ]);

  // AutoModerator
  let automoderator = 'Not configured';
  try {
    await assertWikiAccess(subName);
    const wikiPages = await safeFetch(() => reddit.getWikiPages(subName), []);
    const page = resolveAutomodPage(wikiPages) ?? DEFAULT_AUTOMOD_PAGE;
    const wiki = await reddit.getWikiPage(subName, page);
    const rawAutomod = extractString(wiki.content);
    automoderator = normalizeAutomodContent(rawAutomod);
    if (rawAutomod.length === 0) {
      console.warn(`[SubVault] ⚠️ AutoMod config is empty for "${page}"`);
    }
  } catch (err) {
    const msg = String(err);
    if (msg.includes('wiki moderator permission')) throw err;
    if (msg.includes('404') || msg.includes('Not Found')) {
      console.log('[SubVault] AutoMod page not found (not configured)');
    } else {
      console.warn('[SubVault] AutoMod fetch warning:', msg.slice(0, 150));
    }
  }

  const description = extractString(info?.description ?? '');
  const wikiEditMode = info?.wikiSettings?.wikiEditMode ?? 'DISABLED';

  // Normalize subscriber count — Devvit uses subscribersCount in some contexts
  const subscribersCount = info?.subscribersCount ?? info?.subscribers ?? 0;

  const identity = info ? {
    displayName: info.name ?? subName,
    title: info.title ?? '',
    description,
    subredditType: info.type ?? '',
    nsfw: info.isNsfw ?? false,
    // Always store as `subscribersCount` for consistency
    subscribersCount,
    // Keep `subscribers` alias so older snapshots still match
    subscribers: subscribersCount,
    activeCount: info.activeCount ?? 0,
    createdAt: info.createdAt ?? '',
    id: info.id ?? '',
    isQuarantined: info.isQuarantined ?? false,
    detectedLanguage: info.detectedLanguage ?? null,
    isPostingRestricted: info.isPostingRestricted ?? false,
    isCommentingRestricted: info.isCommentingRestricted ?? false,
    isCrosspostingAllowed: info.isCrosspostingAllowed ?? true,
    isArchivePostsEnabled: info.isArchivePostsEnabled ?? false,
    isDiscoveryAllowed: info.isDiscoveryAllowed ?? true,
    isSpoilerAvailable: info.isSpoilerAvailable ?? false,
    isChatPostCreationAllowed: info.isChatPostCreationAllowed ?? false,
    isChatPostFeatureEnabled: info.isChatPostFeatureEnabled ?? false,
    isEmojisEnabled: info.isEmojisEnabled ?? false,
    isPredictionAllowed: info.isPredictionAllowed ?? false,
    isPredictionsTournamentAllowed: info.isPredictionsTournamentAllowed ?? false,
    isPredictionContributorsAllowed: info.isPredictionContributorsAllowed ?? false,
    allAllowedPostTypes: Array.isArray(info.allAllowedPostTypes) ? info.allAllowedPostTypes : [],
    allowedPostCapabilities: Array.isArray(info.allowedPostCapabilities) ? info.allowedPostCapabilities : [],
    allowedMediaInComments: Array.isArray(info.allowedMediaInComments) ? info.allowedMediaInComments : [],
    authorFlairEnabled: info.authorFlairSettings?.isEnabled ?? false,
    authorFlairSelfAssignable: info.authorFlairSettings?.isSelfAssignable ?? false,
    postFlairEnabled: info.postFlairSettings?.isEnabled ?? false,
    postFlairSelfAssignable: info.postFlairSettings?.isSelfAssignable ?? false,
    wikiEditMode,
    communityIcon: info.communityIcon ?? '',
    bannerBackgroundImage: info.bannerBackgroundImage ?? '',
    bannerImg: info.bannerImg ?? '',
    // Prefer keyColor, fall back to primaryColor (some API shapes only return one).
    keyColor: normalizeHexColor(info.keyColor) ?? normalizeHexColor(info.primaryColor) ?? '',
    primaryColor: normalizeHexColor(info.keyColor) ?? normalizeHexColor(info.primaryColor) ?? '',
    iconColor: info.iconColor ?? '',
    publicDescription: null,
    welcomeMessage: null,
    lang: null,
  } : null;

  const styles = subredditStyles && typeof subredditStyles === 'object'
    ? subredditStyles as Record<string, unknown>
    : {};

  const communitySettings: Record<string, unknown> = {
    ...styles,
    title: info?.title ?? '',
    description,
    subredditType: info?.type ?? '',
    nsfw: info?.isNsfw ?? false,
    isPostingRestricted: info?.isPostingRestricted ?? false,
    isCommentingRestricted: info?.isCommentingRestricted ?? false,
    isCrosspostingAllowed: info?.isCrosspostingAllowed ?? true,
    isArchivePostsEnabled: info?.isArchivePostsEnabled ?? false,
    isDiscoveryAllowed: info?.isDiscoveryAllowed ?? true,
    isSpoilerAvailable: info?.isSpoilerAvailable ?? false,
    isChatPostCreationAllowed: info?.isChatPostCreationAllowed ?? false,
    isChatPostFeatureEnabled: info?.isChatPostFeatureEnabled ?? false,
    isEmojisEnabled: info?.isEmojisEnabled ?? false,
    isPredictionAllowed: info?.isPredictionAllowed ?? false,
    isPredictionsTournamentAllowed: info?.isPredictionsTournamentAllowed ?? false,
    isPredictionContributorsAllowed: info?.isPredictionContributorsAllowed ?? false,
    allAllowedPostTypes: Array.isArray(info?.allAllowedPostTypes) ? info.allAllowedPostTypes : [],
    allowedPostCapabilities: Array.isArray(info?.allowedPostCapabilities) ? info.allowedPostCapabilities : [],
    allowedMediaInComments: Array.isArray(info?.allowedMediaInComments) ? info.allowedMediaInComments : [],
    authorFlairEnabled: info?.authorFlairSettings?.isEnabled ?? false,
    authorFlairSelfAssignable: info?.authorFlairSettings?.isSelfAssignable ?? false,
    postFlairEnabled: info?.postFlairSettings?.isEnabled ?? false,
    postFlairSelfAssignable: info?.postFlairSettings?.isSelfAssignable ?? false,
    wikiEditMode,
    publicDescription: null,
    welcomeMessage: null,
    lang: null,
  };

  // Ensure theme color is captured in `settings.keyColor` for restore/verification.
  // `getSubredditStyles()` is inconsistent; the most reliable value is from subreddit info.
  const themeColor = normalizeHexColor(info?.keyColor) ?? normalizeHexColor(info?.primaryColor);
  if (themeColor) {
    communitySettings['keyColor'] = themeColor;
    // Keep the alias for older UI code / diffs, but treat keyColor as canonical.
    communitySettings['primaryColor'] = themeColor;
  }

  const normalizedRules = Array.isArray(rules)
    ? (rules as any[]).map((r, i) => ({
        shortName: r.shortName ?? r.name ?? `Rule ${i + 1}`,
        description: r.description ?? '',
        violationReason: r.violationReason ?? r.shortName ?? r.name ?? '',
        kind: r.kind ?? 'all',
        priority: typeof r.priority === 'number' ? r.priority : i,
      }))
    : [];

  const normalizeFlairs = (arr: unknown[]) =>
    arr.map((f: any) => ({
      id: f.id ?? '',
      text: f.text ?? '',
      textColor: f.textColor ?? 'dark',
      backgroundColor: f.backgroundColor ?? '',
      textEditable: f.textEditable ?? false,
      modOnly: f.modOnly ?? false,
    }));

  return {
    identity,
    settings: communitySettings,
    rules: normalizedRules,
    removalReasons: [],
    flairs: {
      post: normalizeFlairs(Array.isArray(postFlairs) ? postFlairs : []),
      user: normalizeFlairs(Array.isArray(userFlairs) ? userFlairs : []),
    },
    widgets: null,
    automoderator,
    wikiPages: [],
    userManagement: { banned: [], muted: [], approved: [], moderators: [] },
    devvitSettings,
    capturedAt: new Date().toISOString(),
    limitations: {
      publicDescription: 'Not available — not in Devvit API response',
      welcomeMessage: 'Not available — submit_text not in Devvit API response',
      cssStylesheet: 'Read-only — not exposed by Devvit API',
      emojis: 'Read-only — not exposed by Devvit API',
      chatChannels: 'Not available — not exposed by Devvit API',
      modNotes: 'Not available — not exposed by Devvit API',
      safetyFilters: 'Not available — not exposed by Devvit API',
      banEventsHistory: 'Not available — not exposed by Devvit API',
      communityAchievements: 'Not available — not in Devvit API response',
      lang: 'Not available — not in Devvit API response',
    },
  };
}

// ─── Verification ─────────────────────────────────────────────────────────────

/**
 * Normalize snapshot identity data for comparison.
 * Strips fields that are volatile / not restorable so they never cause false drift.
 */
function normalizeIdentityForVerification(id: Record<string, any>): Record<string, any> {
  // Identity verification should only include fields we actually restore.
  // Today, restore writes title + description via `subreddit.updateSettings()`.
  return {
    title: extractString(id?.title ?? ''),
    description: extractString(id?.description ?? ''),
  };
}

/**
 * Normalize settings / appearance for comparison.
 * Unifies color casing and the primaryColor / keyColor aliases.
 */
function normalizeSettingsForVerification(s: Record<string, any>): Record<string, any> {
  const copy = { ...s };

  // Normalize hex colors to lowercase.
  for (const k of ['keyColor', 'bannerBackgroundColor']) {
    const normalized = normalizeHexColor(copy[k]);
    if (normalized) copy[k] = normalized;
    else delete copy[k];
  }

  // `primaryColor` is inconsistent across API shapes and not reliably restorable.
  // Treat `keyColor` as the only canonical theme verification key.
  delete copy['primaryColor'];
  delete copy['legacyPrimaryColor'];

  // Drop volatile / read-only style fields not tracked in appearance section
  delete copy['backgroundColor'];
  delete copy['highlightColor'];
  delete copy['menuBackgroundColor'];
  delete copy['sidebarWidgetBackgroundColor'];
  delete copy['mobileKeyColor'];

  // Drop null-stable fields
  delete copy['publicDescription'];
  delete copy['welcomeMessage'];
  delete copy['lang'];

  return copy;
}

function normalizeForVerification(data: Record<string, unknown>): Record<string, unknown> {
  try {
    const copy = JSON.parse(JSON.stringify(data)) as Record<string, any>;

    if (copy['identity'] && typeof copy['identity'] === 'object') {
      copy['identity'] = normalizeIdentityForVerification(copy['identity'] as Record<string, any>);
    }

    if (copy['settings'] && typeof copy['settings'] === 'object') {
      copy['settings'] = normalizeSettingsForVerification(copy['settings'] as Record<string, any>);
    }

    copy['automoderator'] = normalizeAutomodContent(copy['automoderator']);
    return copy;
  } catch {
    return data;
  }
}

function isAutomodConfigured(value: unknown): boolean {
  return normalizeAutomodContent(value) !== 'Not configured';
}

export function buildVerificationResult(
  targetData: Record<string, unknown>,
  liveData: Record<string, unknown>,
): VerificationResult {
  const target = normalizeForVerification(targetData);
  const live = normalizeForVerification(liveData);

  // If the snapshot didn't track a restorable appearance key, skip verifying that key.
  // This avoids permanent drift/timeouts for older snapshots that never captured theme fields.
  const rawTargetSettings = (targetData['settings'] ?? null) as Record<string, unknown> | null;
  const rawTargetIdentity = (targetData['identity'] ?? null) as Record<string, unknown> | null;

  const rawLiveSettings = (liveData['settings'] ?? null) as Record<string, unknown> | null;
  const rawLiveIdentity = (liveData['identity'] ?? null) as Record<string, unknown> | null;

  const targetTheme = resolveThemeColor(rawTargetSettings, rawTargetIdentity);
  const liveTheme = resolveThemeColor(rawLiveSettings, rawLiveIdentity);

  const targetSettings = (target['settings'] ?? null) as Record<string, unknown> | null;
  const liveSettings = (live['settings'] ?? null) as Record<string, unknown> | null;

  if (targetSettings && liveSettings) {
    const tracksKeyColor = typeof targetTheme === 'string' && targetTheme.length > 0;
    // These two fields have been inconsistent in readback across Devvit API surfaces,
    // so they should not block verification completion.
    const tracksHeaderTitle = false;
    const tracksBannerBg = false;

    if (tracksKeyColor) {
      targetSettings['keyColor'] = targetTheme;
      liveSettings['keyColor'] = hasThemeColorMatch(targetTheme, rawLiveSettings, rawLiveIdentity)
        ? targetTheme
        : liveTheme ?? null;
    } else {
      delete targetSettings['keyColor'];
      delete liveSettings['keyColor'];
    }

    if (!tracksHeaderTitle) {
      delete targetSettings['headerTitle'];
      delete liveSettings['headerTitle'];
    }

    if (!tracksBannerBg) {
      delete targetSettings['bannerBackgroundColor'];
      delete liveSettings['bannerBackgroundColor'];
    }
  }

  const targetAutomodConfigured = isAutomodConfigured(target['automoderator']);

  const diffs = computeSnapshotDiff(target, live);
  const totalAdditions = diffs.reduce((sum, d) => sum + d.additions, 0);
  const totalDeletions = diffs.reduce((sum, d) => sum + d.deletions, 0);

  const restorableSections = new Set([
    'Identity',
    'Rules',
    'AutoModerator',
    'Post Flairs',
    'User Flairs',
    'Community Settings',
    'Appearance / Theme',
  ]);

  const sections: VerificationSection[] = diffs.map(d => ({
    section: d.section,
    additions: d.additions,
    deletions: d.deletions,
    status: d.section === 'AutoModerator' && !targetAutomodConfigured
      ? 'skipped'
      : restorableSections.has(d.section)
        ? 'drifted'
        : 'skipped',
  }));

  if (!targetAutomodConfigured) {
    const automodSection = sections.find(s => s.section === 'AutoModerator');
    if (automodSection) {
      automodSection.status = 'skipped';
    } else {
      sections.push({ section: 'AutoModerator', additions: 0, deletions: 0, status: 'skipped' });
    }
  }

  // Extra guard: explicitly re-check identity description fields
  const tId = target['identity'] as Record<string, any> | null | undefined;
  const lId = live['identity'] as Record<string, any> | null | undefined;
  if (tId && lId) {
    const descMismatch = String(tId.description ?? '') !== String(lId.description ?? '');
    if (descMismatch) {
      const existing = sections.find(s => s.section === 'Identity');
      if (existing) {
        existing.status = 'drifted';
      } else {
        sections.push({ section: 'Identity', additions: 1, deletions: 1, status: 'drifted' });
      }
    }
  }

  const drifted = sections.filter(s => s.status === 'drifted');
  const skippedAutoMod = sections.some(
    s => s.section === 'AutoModerator' && s.status === 'skipped' && !targetAutomodConfigured,
  );
  const notes: string[] =
    drifted.length === 0
      ? [
          'All restored sections match the live subreddit — restore verified successfully. ✓',
          ...(skippedAutoMod
            ? ['AutoModerator was not configured in the target snapshot, so verification skipped that section.']
            : []),
        ]
      : drifted.map(
          s =>
            `${s.section}: live state still differs from snapshot (+${s.additions} / -${s.deletions}). ` +
            'Reddit may need a moment to propagate changes, or the Devvit API had a temporary error.',
        );

  return {
    sectionsChanged: drifted.length,
    totalAdditions,
    totalDeletions,
    sections,
    verifiedAt: new Date().toISOString(),
    verified: drifted.length === 0,
    notes,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidSnapshotData(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  for (const field of ['identity', 'rules', 'flairs', 'automoderator', 'userManagement', 'capturedAt', 'limitations']) {
    // `identity` can be null if the API couldn't fetch subreddit info.
    if (!(field in obj)) return false;
    if (field !== 'identity' && obj[field] == null) return false;
  }
  if (!Array.isArray(obj['rules'])) return false;
  if (!Array.isArray(obj['removalReasons'])) return false;
  const flairs = obj['flairs'] as Record<string, unknown>;
  if (!Array.isArray(flairs?.['post']) || !Array.isArray(flairs?.['user'])) return false;
  if (typeof obj['userManagement'] !== 'object' || !obj['userManagement']) return false;
  return true;
}

// ─── GET /api/snapshot — List all snapshots ───────────────────────────────────

snapshot.get('/', async (c) => {
  try {
    const map = await redis.hGetAll('snapshot_backups');
    if (Object.keys(map).length === 0) return c.json([]);

    const items: SnapshotListItem[] = [];
    for (const raw of Object.values(map)) {
      const parsed = parseStoredSnapshot(raw);
      if (parsed) items.push(toListItem(parsed));
    }
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return c.json(items);
  } catch (err) {
    console.error('[SubVault] GET /snapshot failed:', err);
    return c.json({ error: 'Failed to fetch snapshots' }, 500);
  }
});

// ─── POST /api/snapshot — Create a manual snapshot ───────────────────────────

snapshot.post('/', async (c) => {
  try {
    const body = await c.req.json<{ message?: string; description?: string }>();
    const subName = context.subredditName;
    if (!subName) return c.json({ error: 'Missing subreddit context' }, 400);

    const creator = await safeFetch(() => reddit.getCurrentUsername(), 'UnknownMod');
    const baseMessage = body.message?.trim() || 'Manual snapshot';
    const message = `${baseMessage} — by ${creator}`;

    const data = await captureSnapshot(subName);
    const timestamp = Date.now();
    const id = `manual_${timestamp}`;
    const snap: StoredSnapshot = {
      id,
      message,
      data,
      createdAt: new Date(timestamp).toISOString(),
    };

    await saveSnapshot(snap);
    console.log('[SubVault] Manual snapshot saved:', id);
    return c.json(toListItem(snap), 201);
  } catch (err) {
    console.error('[SubVault] POST /snapshot failed:', err);
    return c.json({ error: 'Failed to save snapshot' }, 500);
  }
});

// ─── GET /api/snapshot/:id — Get snapshot detail ─────────────────────────────

snapshot.get('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const snap = await loadSnapshot(id);
    if (!snap) return c.json({ error: 'Snapshot not found' }, 404);
    if (!isValidSnapshotData(snap.data)) {
      return c.json({ error: 'Snapshot data is incomplete or corrupted' }, 400);
    }
    return c.json({ ...toListItem(snap), data: snap.data });
  } catch (err) {
    console.error('[SubVault] GET /snapshot/:id failed:', err);
    return c.json({ error: 'Failed to fetch snapshot details' }, 500);
  }
});

// ─── GET /api/snapshot/:id/diff — Compute diff vs previous ───────────────────

snapshot.get('/:id/diff', async (c) => {
  const id = c.req.param('id');
  try {
    const current = await loadSnapshot(id);
    if (!current) return c.json({ error: 'Snapshot not found' }, 404);

    const all = await getAllSnapshotsSorted();
    const idx = all.findIndex(s => s.id === id);
    const previous = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;

    return c.json({
      current: {
        id: current.id,
        message: current.message,
        createdAt: current.createdAt,
        data: current.data,
      },
      previous: previous
        ? {
            id: previous.id,
            message: previous.message,
            createdAt: previous.createdAt,
            data: previous.data,
          }
        : null,
    });
  } catch (err) {
    console.error('[SubVault] GET /snapshot/:id/diff failed:', err);
    return c.json({ error: 'Failed to compute diff' }, 500);
  }
});

// ─── GET /api/snapshot/:pollingId/verify-status — Poll verification ───────────

snapshot.get('/:pollingId/verify-status', async (c) => {
  const pollingId = c.req.param('pollingId');
  try {
    const session = await readPollingSession(pollingId);
    if (!session) return c.json({ error: 'Polling session not found' }, 404);

    if (session.verified || session.timedOut || !session.isActive) {
      return c.json(session);
    }

    if (session.currentAttempt >= session.maxAttempts) {
      session.isActive = false;
      session.timedOut = true;
      session.completedAt = new Date().toISOString();
      await writePollingSession(session);
      return c.json(session);
    }

    if (session.lastAttemptAt) {
      const elapsed = Date.now() - new Date(session.lastAttemptAt).getTime();
      if (elapsed < VERIFICATION_POLL_INTERVAL_MS) {
        return c.json({ ...session, nextPollAfterMs: VERIFICATION_POLL_INTERVAL_MS - elapsed });
      }
    }

    const target = await loadSnapshot(session.targetId);
    if (!target?.data) {
      session.isActive = false;
      session.completedAt = new Date().toISOString();
      session.lastVerification = {
        sectionsChanged: 0,
        totalAdditions: 0,
        totalDeletions: 0,
        sections: [],
        verifiedAt: new Date().toISOString(),
        verified: false,
        notes: ['Target snapshot could not be loaded for verification.'],
      };
      await writePollingSession(session);
      return c.json(session, 500);
    }

    session.currentAttempt += 1;
    session.lastAttemptAt = new Date().toISOString();

    const liveData = await captureSnapshot(session.subName);
    const verification = buildVerificationResult(target.data, liveData);
    session.lastVerification = verification;

    if (verification.verified || session.currentAttempt >= session.maxAttempts) {
      session.isActive = false;
      session.verified = verification.verified;
      session.timedOut = !verification.verified;
      session.completedAt = new Date().toISOString();

      const vSnap: StoredSnapshot = {
        id: `verify_${pollingId}`,
        message: 'Verification capture after restore — by SubVault',
        data: liveData,
        createdAt: new Date().toISOString(),
      };
      await saveSnapshot(vSnap);
    }

    await writePollingSession(session);
    return c.json(session, session.timedOut ? 408 : 200);
  } catch (err) {
    console.error('[SubVault] GET /verify-status failed:', err);
    return c.json({ error: 'Failed to fetch verification status' }, 500);
  }
});

// ─── POST /api/snapshot/:id/restore — Restore a snapshot ─────────────────────

snapshot.post('/:id/restore', async (c) => {
  try {
    const body = await c.req.json<{ targetId?: string }>();
    const { targetId } = body;
    if (!targetId) return c.json({ error: 'targetId is required' }, 400);

    const subName = context.subredditName;
    if (!subName) return c.json({ error: 'Missing subreddit context' }, 400);

    const target = await loadSnapshot(targetId);
    if (!target?.data) return c.json({ error: 'Target snapshot not found or invalid' }, 404);

    const d = target.data;
    const results: Record<string, { success: boolean; count?: number; skipped?: boolean; error?: string }> = {};
    const subreddit = await reddit.getSubredditByName(subName);
    type SubredditUpdateSettings = Parameters<typeof subreddit.updateSettings>[0];

    async function attempt(name: string, fn: () => Promise<void>): Promise<void> {
      try {
        await fn();
        console.log(`[SubVault] ✓ ${name} restored`);
        results[name] = { success: true };
      } catch (err) {
        console.error(`[SubVault] ✗ ${name} failed:`, err);
        results[name] = { success: false, error: String(err).slice(0, 200) };
      }
    }

    const getRules = (): Array<Record<string, unknown>> => {
      const raw = d['rules'];
      return Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
    };

    const getFlairs = (kind: 'post' | 'user'): Array<Record<string, unknown>> => {
      const flairs = d['flairs'] as Record<string, unknown> | undefined;
      const arr = flairs?.[kind];
      return Array.isArray(arr) ? (arr as Array<Record<string, unknown>>) : [];
    };

    const settingsData = d['settings'] as Record<string, unknown> | null | undefined;
    const identityData = d['identity'] as Record<string, unknown> | null | undefined;

    // ── Build community settings update ──────────────────────────────────────
    const communitySettingsUpdate: SubredditUpdateSettings = {};

    if (identityData) {
      const title = extractString(identityData['title']);
      const description = extractString(identityData['description']);
      if (title) communitySettingsUpdate.title = title;
      if (description) communitySettingsUpdate.description = description;
    }

    if (settingsData) {
      const postingRestricted = settingsData['isPostingRestricted'];
      if (typeof postingRestricted === 'boolean') communitySettingsUpdate.restrictPosting = postingRestricted;

      const commentingRestricted = settingsData['isCommentingRestricted'];
      if (typeof commentingRestricted === 'boolean') communitySettingsUpdate.restrictCommenting = commentingRestricted;

      const archivePosts = settingsData['isArchivePostsEnabled'];
      if (typeof archivePosts === 'boolean') communitySettingsUpdate.shouldArchivePosts = archivePosts;

      const discoveryAllowed = settingsData['isDiscoveryAllowed'];
      if (typeof discoveryAllowed === 'boolean') communitySettingsUpdate.allowDiscovery = discoveryAllowed;

      const spoilerAvailable = settingsData['isSpoilerAvailable'];
      if (typeof spoilerAvailable === 'boolean') communitySettingsUpdate.spoilersEnabled = spoilerAvailable;

      const chatPostCreationAllowed = settingsData['isChatPostCreationAllowed'];
      if (typeof chatPostCreationAllowed === 'boolean') communitySettingsUpdate.allowChatPostCreation = chatPostCreationAllowed;

      const chatPostFeatureEnabled = settingsData['isChatPostFeatureEnabled'];
      if (typeof chatPostFeatureEnabled === 'boolean') communitySettingsUpdate.chatPostEnabled = chatPostFeatureEnabled;

      const emojisEnabled = settingsData['isEmojisEnabled'];
      if (typeof emojisEnabled === 'boolean') communitySettingsUpdate.emojisEnabled = emojisEnabled;

      const predictionsAllowed = settingsData['isPredictionAllowed'];
      if (typeof predictionsAllowed === 'boolean') communitySettingsUpdate.allowPredictions = predictionsAllowed;

      const predictionsTournamentAllowed = settingsData['isPredictionsTournamentAllowed'];
      if (typeof predictionsTournamentAllowed === 'boolean')
        communitySettingsUpdate.allowPredictionsTournament = predictionsTournamentAllowed;

      const predictionContributorsAllowed = settingsData['isPredictionContributorsAllowed'];
      if (typeof predictionContributorsAllowed === 'boolean')
        communitySettingsUpdate.allowPredictionContributors = predictionContributorsAllowed;

      const crosspostingAllowed = settingsData['isCrosspostingAllowed'];
      if (typeof crosspostingAllowed === 'boolean') communitySettingsUpdate.crosspostable = crosspostingAllowed;

      const userFlairs = settingsData['authorFlairEnabled'];
      if (typeof userFlairs === 'boolean') {
        const authorFlairSelfAssignable = settingsData['authorFlairSelfAssignable'];
        communitySettingsUpdate.userFlairs = {
          enabled: userFlairs,
          usersCanAssign: typeof authorFlairSelfAssignable === 'boolean' ? authorFlairSelfAssignable : false,
        };
      }

      const postFlairs = settingsData['postFlairEnabled'];
      if (typeof postFlairs === 'boolean') {
        const postFlairSelfAssignable = settingsData['postFlairSelfAssignable'];
        communitySettingsUpdate.postFlairs = {
          enabled: postFlairs,
          usersCanAssign: typeof postFlairSelfAssignable === 'boolean' ? postFlairSelfAssignable : false,
        };
      }

      const wikiEditMode = settingsData['wikiEditMode'];
      if (typeof wikiEditMode === 'string' && wikiEditMode) {
        communitySettingsUpdate.wikiEnabled = wikiEditMode.toLowerCase() !== 'disabled';
      }
    }

    // ── Build appearance update ───────────────────────────────────────────────
    // Only set keys we can reliably restore via `subreddit.updateSettings()`.
    // Never overwrite with empty strings.
    const appearanceUpdate: SubredditUpdateSettings = {};

    const themeColor = resolveThemeColor(settingsData, identityData);
    if (themeColor) {
      appearanceUpdate.keyColor = themeColor;
      appearanceUpdate.primaryColor = themeColor;
    }

    const bannerBgColor = normalizeHexColor(settingsData?.['bannerBackgroundColor']);
    if (bannerBgColor) {
      appearanceUpdate.bannerBackgroundColor = bannerBgColor;
    }

    const headerTitle = settingsData?.['headerTitle'];
    if (typeof headerTitle === 'string') {
      appearanceUpdate.headerTitle = headerTitle;
    }

    // ── 1. Rules ──────────────────────────────────────────────────────────────
    await attempt('rules', async () => {
      const snapshotRules = getRules();
      if (snapshotRules.length === 0) {
        results['rules'] = { success: true, skipped: true };
        return;
      }

      const current = await reddit.getRules(subName);
      const existingNames = new Set(current.map((r: any) => (r.shortName ?? '').toLowerCase()));
      const sorted = [...snapshotRules].sort(
        (a, b) => (a['priority'] as number) - (b['priority'] as number),
      );

      let added = 0;
      for (const rule of sorted) {
        const name = (rule['shortName'] as string) || 'Rule';
        if (!existingNames.has(name.toLowerCase())) {
          await reddit.createRule(subName, {
            shortName: name,
            description: (rule['description'] as string) ?? '',
            violationReason: (rule['violationReason'] as string) || name,
            kind: (rule['kind'] as 'link' | 'comment' | 'all') ?? 'all',
          });
          added++;
        }
      }
      results['rules'] = { success: true, count: added };
      if (added < snapshotRules.length) {
        results['rules']!.error =
          'Some rules already exist and were skipped. Devvit cannot delete rules — remove stale ones manually.';
      }
    });

    // ── 2. Community settings ──────────────────────────────────────────────────
    await attempt('communitySettings', async () => {
      if (Object.keys(communitySettingsUpdate).length === 0) {
        results['communitySettings'] = { success: true, skipped: true };
        return;
      }
      await subreddit.updateSettings(communitySettingsUpdate);
      results['communitySettings'] = { success: true, count: Object.keys(communitySettingsUpdate).length };
    });

    // ── 3. Appearance / Theme ─────────────────────────────────────────────────
    await attempt('appearance', async () => {
      if (Object.keys(appearanceUpdate).length === 0) {
        results['appearance'] = { success: true, skipped: true };
        return;
      }
      await subreddit.updateSettings(appearanceUpdate);

      // Best-effort readback check so we don't silently report success when the API ignores a change.
      if (themeColor) {
        const info = await safeFetch(() => reddit.getSubredditInfoByName(subName), null) as any;
        const styles = await safeFetch(() => reddit.getSubredditStyles(context.subredditId), null) as Record<string, unknown> | null;
        const observedCandidates = getThemeColorCandidates(styles, info as Record<string, unknown> | null);

        if (!hasThemeColorMatch(themeColor, styles, info as Record<string, unknown> | null)) {
          results['appearance'] = {
            success: true,
            count: Object.keys(appearanceUpdate).length,
            error: `Theme color may not have applied yet (requested ${themeColor}, observed ${observedCandidates.join(', ') || 'none'}).`,
          };
          console.warn('[SubVault] appearance readback mismatch', {
            subreddit: subName,
            requested: themeColor,
            observedCandidates,
          });
          return;
        }
      }

      results['appearance'] = { success: true, count: Object.keys(appearanceUpdate).length };
    });

    // ── 4. AutoModerator ──────────────────────────────────────────────────────
    await attempt('automoderator', async () => {
      const config = d['automoderator'];
      const wikiPages = await safeFetch(() => reddit.getWikiPages(subName), []);
      const page = resolveAutomodPage(wikiPages) ?? DEFAULT_AUTOMOD_PAGE;

      if (typeof config !== 'string') {
        results['automoderator'] = { success: true, skipped: true };
        return;
      }

      await assertWikiAccess(subName);

      const normalizedConfig = normalizeAutomodContent(config);
      const content = normalizedConfig === 'Not configured' ? '' : normalizedConfig;
      const reason =
        normalizedConfig === 'Not configured'
          ? 'SubVault: removed AutoModerator (snapshot indicated none)'
          : 'SubVault: restored from snapshot';

      await reddit.updateWikiPage({ subredditName: subName, page, content, reason });
    });

    // ── 5. Post flairs ────────────────────────────────────────────────────────
    await attempt('postFlairs', async () => {
      const snapshotFlairs = getFlairs('post');
      const current = await reddit.getPostFlairTemplates(subName);
      for (const f of current) await reddit.deleteFlairTemplate(subName, f.id);
      if (snapshotFlairs.length === 0) {
        results['postFlairs'] = { success: true, skipped: true };
        return;
      }
      for (const f of snapshotFlairs) {
        await reddit.createPostFlairTemplate({
          subredditName: subName,
          text: (f['text'] as string) ?? '',
          textColor: (f['textColor'] as 'light' | 'dark') ?? 'dark',
          backgroundColor: (f['backgroundColor'] as string) ?? '',
          modOnly: (f['modOnly'] as boolean) ?? false,
        });
      }
      results['postFlairs'] = { success: true, count: snapshotFlairs.length };
    });

    // ── 6. User flairs ────────────────────────────────────────────────────────
    await attempt('userFlairs', async () => {
      const snapshotFlairs = getFlairs('user');
      const current = await reddit.getUserFlairTemplates(subName);
      for (const f of current) await reddit.deleteFlairTemplate(subName, f.id);
      if (snapshotFlairs.length === 0) {
        results['userFlairs'] = { success: true, skipped: true };
        return;
      }
      for (const f of snapshotFlairs) {
        await reddit.createUserFlairTemplate({
          subredditName: subName,
          text: (f['text'] as string) ?? '',
          textColor: (f['textColor'] as 'light' | 'dark') ?? 'dark',
          backgroundColor: (f['backgroundColor'] as string) ?? '',
          modOnly: (f['modOnly'] as boolean) ?? false,
        });
      }
      results['userFlairs'] = { success: true, count: snapshotFlairs.length };
    });

    // ── 7. User management — intentionally skipped (too destructive) ──────────
    results['userManagement'] = { success: true, skipped: true };

    // ── 8. Save restore audit snapshot ────────────────────────────────────────
    const timestamp = Date.now();
    const auditSnap: StoredSnapshot = {
      id: `restore_${timestamp}`,
      message: `Restored from: ${target.message ?? targetId}`,
      data: target.data,
      createdAt: new Date(timestamp).toISOString(),
    };
    await saveSnapshot(auditSnap);

    // ── 9. Set restore-in-progress flag ───────────────────────────────────────
    await redis.set(`restore_in_progress:${subName}`, 'true');
    await redis.expire(`restore_in_progress:${subName}`, 60);

    // ── 10. Create polling session for background verification ────────────────
    const pollingId = `poll_${timestamp}`;
    const pollingSession: PollingSession = {
      pollingId,
      restoreId: auditSnap.id,
      targetId,
      subName,
      currentAttempt: 0,
      maxAttempts: VERIFICATION_MAX_ATTEMPTS,
      isActive: true,
      verified: false,
      timedOut: false,
      createdAt: new Date().toISOString(),
    };
    await writePollingSession(pollingSession);

    const anyFailed = Object.values(results).some(r => !r.success);
    console.log('[SubVault] Restore complete. Results:', JSON.stringify(results, null, 2));

    return c.json({
      success: true,
      partialFailure: anyFailed,
      newId: auditSnap.id,
      pollingId,
      restoreResults: results,
      message: anyFailed
        ? 'Restore completed with some failures — check restoreResults for details.'
        : 'Restore applied successfully. Verifying snapshot match in the background.',
    });
  } catch (err) {
    console.error('[SubVault] POST /restore failed:', err);
    return c.json({ error: 'Failed to restore snapshot' }, 500);
  }
});