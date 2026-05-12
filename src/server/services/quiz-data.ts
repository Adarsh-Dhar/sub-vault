import { context, reddit, redis } from '@devvit/web/server';

import type { QuizSettings } from '../../shared/quiz-types';

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  difficulty: 'medium',
  passing_score: 70,
  questions_count: 5,
  pass_flair_text: 'Verified member',
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
    const settingsJson = await redis.get('quiz:settings');

    if (!settingsJson) {
      return DEFAULT_QUIZ_SETTINGS;
    }

    return {
      ...DEFAULT_QUIZ_SETTINGS,
      ...(JSON.parse(settingsJson) as Partial<QuizSettings>),
    };
  } catch (error) {
    console.error('Error reading quiz settings:', error);
    return DEFAULT_QUIZ_SETTINGS;
  }
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