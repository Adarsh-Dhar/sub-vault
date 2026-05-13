import { Devvit } from '@devvit/public-api';

const forwardJson = async (path: string, body: unknown) => {
  await fetch(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
};

Devvit.addTrigger({
  events: ['SubredditSubscribe'] as any,
  onEvent: async (event: any) => {
    try {
      await forwardJson('/internal/triggers/on-subscribe', {
        user: { name: event.user?.name, id: event.user?.id },
      });
    } catch (error) {
      console.error('Failed to forward SubredditSubscribe to Hono:', error);
    }
  },
});

Devvit.addTrigger({
  events: ['PostSubmit'],
  onEvent: async (event) => {
    try {
      await forwardJson('/internal/triggers/on-post-submit', {
        author: { name: event.author?.name, id: event.author?.id },
        post: { id: event.post?.id },
      });
    } catch (error) {
      console.error('Failed to forward PostSubmit to Hono:', error);
    }
  },
});

export default Devvit;
