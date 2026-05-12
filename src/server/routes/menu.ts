import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, redis } from '@devvit/web/server';
import { createPost } from '../core/post';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const post = await createPost();

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create post',
      },
      400
    );
  }
});

/**
 * POST /internal/menu/quiz-settings
 * Show quiz settings configuration form for moderators
 */
menu.post('/quiz-settings', async (c) => {
  try {
    // Fetch current settings
    const settingsJson = await redis.get('quiz:settings');
    const DEFAULT_QUIZ_SETTINGS = {
      difficulty: 'medium' as const,
      passing_score: 70,
      questions_count: 5,
      pass_flair_text: 'Verified member',
    };
    
    const currentSettings = settingsJson
      ? { ...DEFAULT_QUIZ_SETTINGS, ...JSON.parse(settingsJson) }
      : DEFAULT_QUIZ_SETTINGS;

    return c.json<UiResponse>({
      showForm: {
        name: 'quizSettingsForm',
        form: {
          title: 'Quiz Settings',
          description: 'Configure quiz parameters for your subreddit',
          acceptLabel: 'Save Settings',
          fields: [
            {
              type: 'number',
              name: 'passing_score',
              label: 'Passing Score Threshold (%)',
              defaultValue: currentSettings.passing_score,
              helpText: 'The minimum percentage required to pass the quiz (0-100)',
              required: true,
            },
            {
              type: 'select',
              name: 'difficulty',
              label: 'Default Quiz Difficulty',
              options: [
                { label: 'Easy', value: 'easy' },
                { label: 'Medium', value: 'medium' },
                { label: 'Hard', value: 'hard' },
              ],
              defaultValue: currentSettings.difficulty,
              required: true,
            },
            {
              type: 'number',
              name: 'questions_count',
              label: 'Number of Questions',
              defaultValue: currentSettings.questions_count,
              helpText: 'Number of questions per quiz (1-50)',
              required: true,
            },
            {
              type: 'string',
              name: 'pass_flair_text',
              label: 'Flair Text on Pass',
              defaultValue: currentSettings.pass_flair_text,
              helpText: 'The user flair to assign when someone passes the quiz',
              required: true,
            },
          ],
        },
      },
    });
  } catch (error) {
    console.error('Error fetching quiz settings:', error);
    return c.json<UiResponse>(
      { showToast: 'Error loading settings' },
      500
    );
  }
});
