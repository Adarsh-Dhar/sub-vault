import { redis, reddit } from '@devvit/web/server';

export const createPost = async () => {
  const post = await reddit.submitCustomPost({
    title: 'sub-vault',
  });

  // Persist the post ID so OnSubscribe and OnPostSubmit can include the link
  // in their DMs and removal comments
  await redis.set('quiz:active_post_id', post.id);
  console.log(`[Quiz] Active quiz post ID saved to Redis: ${post.id}`);

  return post;
};