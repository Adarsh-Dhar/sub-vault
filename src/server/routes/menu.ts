import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
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
 * POST /internal/menu/rank-settings
 * Rank settings are edited in-app; this keeps the menu item wired without
 * relying on the retired quiz settings form.
 */
menu.post('/rank-settings', async (c) => {
  try {
    return c.json<UiResponse>(
      {
        showToast: `Open the app on r/${context.subredditName} to edit rank settings.`,
      },
      200
    );
  } catch (error) {
    console.error('Error opening rank settings:', error);
    return c.json<UiResponse>({ showToast: 'Error opening rank settings' }, 500);
  }
});
