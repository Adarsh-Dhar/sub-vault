import { Devvit } from '@devvit/public-api';
import './server/index.js';
import { checkDangerousContent } from './server/services/gemini.js';

Devvit.configure({
  redis: true,
  http: true,
  redditAPI: true,
});

Devvit.addTrigger({
  events: ['PostSubmit'],
  onEvent: async (event, context) => {
    const { reddit, redis } = context;
    const author = event.author;
    const postData = event.post;

    if (!author?.name || !author.id || !postData?.id) {
      return;
    }

    console.log(`[Quiz] NATIVE PostSubmit triggered for ${author.name}`);

    try {
      const [hasPassedById, hasPassedByName] = await Promise.all([
        redis.get(`quiz:passed:${author.id}`),
        redis.get(`quiz:passed:${author.name}`),
      ]);
      const hasPassed = hasPassedById === 'true' || hasPassedByName === 'true' ? 'true' : null;
      const post = await reddit.getPostById(postData.id);
      const subredditName = post.subredditName;

      if (hasPassed === 'true') {
        console.log('[Quiz] User passed. Running Dangerous Vibe Check.');

        const vibeCheck = await checkDangerousContent(post.title, post.body ?? '');

        if (vibeCheck.isDangerous) {
          console.log(`[Quiz] Dangerous post detected: ${vibeCheck.reason}`);

          try {
            await reddit.setPostFlair({
              subredditName,
              postId: post.id,
              text: 'Dangerous',
              backgroundColor: '#000000',
            });
          } catch (flairError) {
            console.warn(`[Quiz] Could not set Dangerous flair on ${post.id}:`, flairError);
          }

          try {
            await post.remove(true);

            const comment = await post.addComment({
              text: `This post was automatically removed by AI moderation because it was flagged as dangerous/violating.\n\n**Reason:** ${vibeCheck.reason ?? 'Flagged by AI'}`,
            });
            await comment.lock();
          } catch (removeError) {
            console.error(`[Quiz] Failed to remove or comment on dangerous post ${post.id}:`, removeError);
            throw removeError;
          }
        }

        return;
      }

      console.log(`[Quiz] User ${author.name} hasn't passed! Removing post.`);

      try {
        await reddit.setPostFlair({
          subredditName,
          postId: post.id,
          text: 'Pending Quiz',
          backgroundColor: '#FF4500',
        });
      } catch (flairError) {
        console.warn(`[Quiz] Could not set Pending Quiz flair on ${post.id}:`, flairError);
      }

      try {
        await post.remove(true);

        const quizPostId = await redis.get('quiz:active_post_id');
      const quizLink = quizPostId ? `https://reddit.com/post/${quizPostId}` : null;
      const commentText = quizLink
        ? `Hi u/${author.name}, your post was automatically removed because you haven't passed our community rules quiz yet.\n\n👉 **[Click here to take the quiz](${quizLink})**`
        : `Hi u/${author.name}, your post was removed because you haven't completed our onboarding quiz yet.`;

        const comment = await post.addComment({ text: commentText });
        await comment.lock();
      } catch (removeError) {
        console.error(`[Quiz] Failed to remove or comment on pending-quiz post ${post.id}:`, removeError);
        throw removeError;
      }
    } catch (error) {
      console.error('[Quiz] NATIVE PostSubmit error:', error);
      throw error;
    }
  },
});

export default Devvit;