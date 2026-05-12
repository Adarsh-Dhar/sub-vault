import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { redis } from '@devvit/web/server';

type ExampleFormValues = {
  message?: string;
};

type QuizSettingsFormValues = {
  passing_score?: number;
  difficulty?: string;
  questions_count?: number;
  pass_flair_text?: string;
};

export const forms = new Hono();

forms.post('/example-submit', async (c) => {
  const { message } = await c.req.json<ExampleFormValues>();
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';

  return c.json<UiResponse>(
    {
      showToast: trimmedMessage
        ? `Form says: ${trimmedMessage}`
        : 'Form submitted with no message',
    },
    200
  );
});

forms.post('/quiz-settings-submit', async (c) => {
  try {
    const formData = await c.req.json<QuizSettingsFormValues>();
    
    // Validate input
    const DEFAULT_QUIZ_SETTINGS = {
      difficulty: 'medium' as const,
      passing_score: 70,
      questions_count: 5,
      pass_flair_text: 'Verified member',
    };
    
    if (formData.difficulty && !['easy', 'medium', 'hard'].includes(formData.difficulty)) {
      return c.json<UiResponse>(
        { showToast: 'Invalid difficulty level' },
        400
      );
    }

    if (formData.passing_score !== undefined && (formData.passing_score < 0 || formData.passing_score > 100)) {
      return c.json<UiResponse>(
        { showToast: 'Passing score must be between 0 and 100' },
        400
      );
    }

    if (formData.questions_count !== undefined && (formData.questions_count < 1 || formData.questions_count > 50)) {
      return c.json<UiResponse>(
        { showToast: 'Questions count must be between 1 and 50' },
        400
      );
    }

    // Fetch current settings
    const settingsJson = await redis.get('quiz:settings');
    const currentSettings = settingsJson
      ? { ...DEFAULT_QUIZ_SETTINGS, ...JSON.parse(settingsJson) }
      : DEFAULT_QUIZ_SETTINGS;

    // Merge with new values
    const updatedSettings = {
      difficulty: formData.difficulty || currentSettings.difficulty,
      passing_score: formData.passing_score !== undefined ? formData.passing_score : currentSettings.passing_score,
      questions_count: formData.questions_count !== undefined ? formData.questions_count : currentSettings.questions_count,
      pass_flair_text: formData.pass_flair_text || currentSettings.pass_flair_text,
    };

    // Store updated settings
    await redis.set('quiz:settings', JSON.stringify(updatedSettings));

    return c.json<UiResponse>(
      {
        showToast: `Quiz settings updated! Passing score: ${updatedSettings.passing_score}%, Difficulty: ${updatedSettings.difficulty}`,
      },
      200
    );
  } catch (error) {
    console.error('Error in quiz settings form:', error);
    return c.json<UiResponse>(
      {
        showToast: 'Error updating settings. Please try again.',
      },
      500
    );
  }
});
