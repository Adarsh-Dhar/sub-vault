import { context, reddit, redis } from '@devvit/web/server';

import type { QuizSettings } from '../../shared/quiz-types';

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  difficulty: 'medium',
  questions_count: 5,
  passing_score: 70,
  veteran_account_age_days: 365,
  veteran_karma_threshold: 10000,
  pass_flair_text: 'Verified member',
  welcome_dm_enabled: true,
  welcome_dm_links: JSON.stringify([
    { label: 'Community Rules', url: 'https://reddit.com/r/sub_vault_dev/wiki/rules' },
    { label: 'FAQ', url: 'https://reddit.com/r/sub_vault_dev/wiki/faq' },
  ]),
  retry_cooldown_minutes: 10,
  max_attempts: 5,
};

function getCurrentSubredditName(): string {
  const subredditName = context.subredditName;

  if (!subredditName) {
    throw new Error('Missing subreddit context');
  }

  return subredditName;
}

export async function getQuizSettings(): Promise<QuizSettings> {
  try {
    // Try native Devvit settings first (set by mods in Mod Tools sidebar)
    // Note: context.settings may not be in the type definitions but is available at runtime
    const contextWithSettings = context as any;
    if (contextWithSettings.settings) {
      const difficulty = await contextWithSettings.settings.get('difficulty');
      const questions_count = await contextWithSettings.settings.get('questions_count');
      const passing_score = await contextWithSettings.settings.get('passing_score');
      const pass_flair_text = await contextWithSettings.settings.get('pass_flair_text');
      const veteran_account_age_days = await contextWithSettings.settings.get('veteran_account_age_days');
      const veteran_karma_threshold = await contextWithSettings.settings.get('veteran_karma_threshold');
      const welcome_dm_enabled = await contextWithSettings.settings.get('welcome_dm_enabled');
      const welcome_dm_links = await contextWithSettings.settings.get('welcome_dm_links');
      const retry_cooldown_minutes = await contextWithSettings.settings.get('retry_cooldown_minutes');
      const max_attempts = await contextWithSettings.settings.get('max_attempts');

      if (difficulty || passing_score !== undefined) {
        return {
          difficulty: (difficulty ?? DEFAULT_QUIZ_SETTINGS.difficulty) as any,
          questions_count: questions_count ?? DEFAULT_QUIZ_SETTINGS.questions_count,
          passing_score: passing_score ?? DEFAULT_QUIZ_SETTINGS.passing_score,
          pass_flair_text: pass_flair_text ?? DEFAULT_QUIZ_SETTINGS.pass_flair_text,
          veteran_account_age_days: veteran_account_age_days ?? DEFAULT_QUIZ_SETTINGS.veteran_account_age_days,
          veteran_karma_threshold: veteran_karma_threshold ?? DEFAULT_QUIZ_SETTINGS.veteran_karma_threshold,
          welcome_dm_enabled: welcome_dm_enabled ?? DEFAULT_QUIZ_SETTINGS.welcome_dm_enabled,
          welcome_dm_links: welcome_dm_links ?? DEFAULT_QUIZ_SETTINGS.welcome_dm_links,
          retry_cooldown_minutes: retry_cooldown_minutes ?? DEFAULT_QUIZ_SETTINGS.retry_cooldown_minutes,
          max_attempts: max_attempts ?? DEFAULT_QUIZ_SETTINGS.max_attempts,
        };
      }
    }
  } catch {
    // context.settings not available (e.g. during unit tests) — fall through
  }

  // Fall back to Redis-stored settings (from the React modal)
  try {
    const settingsJson = await redis.get('quiz:settings');
    if (settingsJson) {
      return { ...DEFAULT_QUIZ_SETTINGS, ...(JSON.parse(settingsJson) as Partial<QuizSettings>) };
    }
  } catch {
    // ignore
  }

  return DEFAULT_QUIZ_SETTINGS;
}

export async function getSubredditRulesText(): Promise<string> {
  try {
    const subredditName = getCurrentSubredditName();
    const rules = await reddit.getRules(subredditName);

    if (rules.length === 0) {
      return 'No subreddit rules were found.';
    }

    return rules
      .map((rule, index) => {
        const reportText =
          rule.violationReason && rule.violationReason !== rule.shortName
            ? ` (Report text: ${rule.violationReason})`
            : '';

        return `${index + 1}. ${rule.shortName}: ${rule.description}${reportText}`;
      })
      .join('\n');
  } catch (error) {
    console.error('Error fetching subreddit rules:', error);
    return 'Default community guidelines apply';
  }
}

/**
 * Check whether a user is currently locked out due to cooldown or max attempts.
 * Returns an object describing lockout state and remaining cooldown seconds when applicable.
 */
export async function isUserLockedOut(username: string): Promise<{ locked: boolean; reason?: 'maxAttemptsReached' | 'cooldownActive'; cooldownSeconds?: number }> {
  try {
    const settings = await getQuizSettings();

    // Check max attempts
    if (settings.max_attempts && settings.max_attempts > 0) {
      const attemptsRaw = await redis.get(`quiz:attempts:${username}`);
      const attempts = parseInt(attemptsRaw || '0', 10);
      if (attempts >= settings.max_attempts) {
        return { locked: true, reason: 'maxAttemptsReached' };
      }
    }

    // Check cooldown key — we store an expiry timestamp (ms) as the value
    const cooldownVal = await redis.get(`quiz:cooldown:${username}`);
    if (cooldownVal) {
      const expiresAt = parseInt(cooldownVal, 10);
      if (!Number.isNaN(expiresAt)) {
        const now = Date.now();
        const remainingMs = expiresAt - now;
        if (remainingMs > 0) {
          return { locked: true, reason: 'cooldownActive', cooldownSeconds: Math.ceil(remainingMs / 1000) };
        }
        // expired — clear the key
        try {
          await redis.del(`quiz:cooldown:${username}`);
        } catch {
          /* ignore */
        }
      } else {
        // Non-numeric marker — treat as a simple lock
        return { locked: true, reason: 'cooldownActive' };
      }
    }

    return { locked: false };
  } catch (error) {
    console.warn('[Quiz] Error checking lockout status for', username, error);
    return { locked: false };
  }
}

export async function assignPassFlair(username: string, flairText: string): Promise<void> {
  const trimmedFlairText = flairText.trim();

  if (!trimmedFlairText) {
    return;
  }

  const subredditName = getCurrentSubredditName();

  await reddit.setUserFlair({
    subredditName,
    username,
    text: trimmedFlairText,
  });
}

/**
 * Check if user qualifies for veteran bypass (Account Age > X days OR Karma > Y).
 * Returns true if veteran bypass applies, false otherwise.
 */
export async function checkVeteranStatus(username: string): Promise<boolean> {
  try {
    const settings = await getQuizSettings();
    
    // If both thresholds are 0 or undefined, veteran bypass is disabled
    if (!settings.veteran_account_age_days && !settings.veteran_karma_threshold) {
      return false;
    }

    const user = await reddit.getUserByUsername(username);
    if (!user) {
      return false;
    }

    // OR condition: if either threshold is met, user is veteran
    const accountAgeCheck =
      settings.veteran_account_age_days > 0 &&
      user.createdAt &&
      (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24) > settings.veteran_account_age_days;

    const karmaCheck =
      settings.veteran_karma_threshold > 0 &&
      (user.linkKarma ?? 0) + (user.commentKarma ?? 0) > settings.veteran_karma_threshold;

    return accountAgeCheck || karmaCheck;
  } catch (error) {
    // User not found or API error — treat as non-veteran
    console.warn(`[Quiz] Error checking veteran status for ${username}:`, error);
    return false;
  }
}

/**
 * Send welcome DM to user on quiz pass with helpful subreddit resources
 */
export async function sendWelcomeDM(username: string): Promise<void> {
  try {
    const settings = await getQuizSettings();

    if (!settings.welcome_dm_enabled) {
      return;
    }

    // Parse links from settings
    let links = '• Community Rules\n• FAQ';
    try {
      const linksArray = JSON.parse(settings.welcome_dm_links) as Array<{ label: string; url: string }>;
      links = linksArray.map((link) => `• [${link.label}](${link.url})`).join('\n');
    } catch {
      console.warn('[Quiz] Failed to parse welcome_dm_links, using defaults');
    }

    const dmText = `🎉 Congratulations! You passed the rules quiz!\n\nYour posting privileges are now unlocked. Welcome to the community!\n\n**Helpful Resources:**\n${links}\n\nEnjoy your time here!`;

    await reddit.sendPrivateMessage({
      to: username,
      subject: 'Welcome! You passed the quiz!',
      text: dmText,
    });

    console.log(`[Quiz] Welcome DM sent to ${username}`);
  } catch (error) {
    console.warn(`[Quiz] Failed to send welcome DM to ${username}:`, error);
  }
}