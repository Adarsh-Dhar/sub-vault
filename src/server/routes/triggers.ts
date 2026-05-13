/**
 * Trigger handlers for the quiz onboarding app
 */

import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { reddit, redis } from '@devvit/web/server';
import { generateQuiz } from '../services/gemini';
import { getQuizSettings, getSubredditRulesText } from '../services/quiz-data';
import type { QuizState } from '../../shared/quiz-types';
import type { OnModActionRequest } from '@devvit/web/shared';

export const triggers = new Hono();

/**
 * POST /internal/triggers/on-subscribe
 * Triggered automatically when a new user subscribes to the subreddit.
 * Proactively generates a quiz state and sends the user a welcome DM.
 */
triggers.post('/on-subscribe', async (c) => {
  try {
    const input = await c.req.json<any>();
    const username: string | undefined = input.user?.name;
    const userId: string | undefined = input.user?.id;

    if (!username || !userId) {
      console.warn('OnSubscribe trigger: No username/userId in payload');
      return c.json<TriggerResponse>({}, 200);
    }

    console.log(`[Quiz] OnSubscribe triggered for user: ${username}`);

    // Skip if they've already passed
    const hasPassed = await redis.get(`quiz:passed:${userId}`);
    if (hasPassed === 'true') {
      console.log(`[Quiz] User ${username} already passed quiz, skipping`);
      return c.json<TriggerResponse>({}, 200);
    }

    const quizSettings = await getQuizSettings();
    const rules = await getSubredditRulesText();

    // 1. Fetch User Comments
    let userCommentsText = '';
    try {
      const recentComments: string[] = [];
      const commentsIterator = reddit.getCommentsByUser({ username, limit: 10, sort: 'new' });
      for await (const comment of commentsIterator) {
        recentComments.push(`- ${comment.body}`);
      }
      userCommentsText = recentComments.join('\n');
    } catch (err) {
      console.warn(`[Quiz] Could not fetch comments for ${username}`);
    }

    // 2. Fetch Subreddit Context (Top Posts & Ban Reasons)
    const topPosts: string[] = [];
    const banReasons: string[] = [];
    try {
      const subreddit = await reddit.getCurrentSubreddit();
      const postsIter = subreddit.getTopPosts({ timeframe: 'month', limit: 5 });
      for await (const post of postsIter) {
        topPosts.push(post.title);
      }

      const bansIter = subreddit.getBannedUsers({ limit: 10 });
      for await (const ban of bansIter) {
        // Ban object may contain moderation details if available
        const banNote = ((ban as unknown) as Record<string, unknown>).modNote as string | undefined;
        if (banNote) banReasons.push(banNote);
      }
    } catch (err) {
      console.warn(`[Quiz] Could not fetch sub context. App might lack permissions.`);
    }

    // 3. Generate quiz questions with context
    const questions = await generateQuiz(
      rules,
      quizSettings.difficulty,
      quizSettings.questions_count,
      userCommentsText,
      { topPosts, banReasons }
    );

    if (questions.length === 0) {
      console.warn('[Quiz] Failed to generate questions for new subscriber');
    }

    // Initialize quiz state keyed by username (used by the quiz UI)
    const quizState: QuizState = {
      username,
      questions,
      submitted_answers: {},
      result: null,
      timestamp: Date.now(),
    };

    await redis.set(`quiz:state:${username}`, JSON.stringify(quizState));

    // Store both directions so lookups work from either key:
    // - OnPostSubmit knows userId → needs to check quiz:passed:{userId}
    // - quiz submit knows username → needs userId to write quiz:passed:{userId}
    await redis.set(`quiz:userid:${userId}`, username);
    await redis.set(`quiz:userid_by_name:${username}`, userId);

    console.log(`[Quiz] Quiz state initialized for user: ${username}`);

    // Send a welcome DM with a link to the quiz post
    const quizPostId = await redis.get('quiz:active_post_id');

    if (quizPostId) {
      try {
        await reddit.sendPrivateMessage({
          to: username,
          subject: 'Welcome! Complete your rules quiz to unlock posting',
          text: `Welcome to the community! 🎉\n\nBefore you can post, you need to pass our quick community rules quiz. It only takes a few minutes.\n\n👉 **[Click here to take the quiz](https://reddit.com/post/${quizPostId})**\n\nOnce you pass, you'll be able to post freely. Good luck!`,
        });
        console.log(`[Quiz] Welcome DM sent to ${username}`);
      } catch (dmError) {
        // DMs can fail if the user has them disabled — not a fatal error
        console.warn(`[Quiz] Could not send welcome DM to ${username}:`, dmError);
      }
    } else {
      console.warn('[Quiz] No active quiz post ID found in Redis — skipping welcome DM');
    }

    return c.json<TriggerResponse>({}, 200);
  } catch (error) {
    console.error('[Quiz] Error in OnSubscribe handler:', error);
    return c.json<TriggerResponse>({}, 200);
  }
});

/**
 * POST /internal/triggers/on-post-submit
 * Triggered when any user submits a post.
 * If they haven't passed the quiz, the post is removed and they're redirected.
 */
triggers.post('/on-post-submit', async (c) => {
  try {
    const input = await c.req.json<any>();
    const authorName: string | undefined = input.author?.name;
    const authorId: string | undefined = input.author?.id;
    const postId = input.post?.id as `t3_${string}` | undefined;

    if (!authorName || !authorId || !postId) {
      console.warn('[Quiz] OnPostSubmit: Missing author or post info in payload');
      return c.json<TriggerResponse>({}, 200);
    }

    console.log(`[Quiz] OnPostSubmit triggered — author: ${authorName}, post: ${postId}`);

    // Check if the user has passed the quiz (keyed by userId for reliability)
    const hasPassed = await redis.get(`quiz:passed:${authorId}`);

    if (hasPassed === 'true') {
      // All good — user is verified, let the post through
      return c.json<TriggerResponse>({}, 200);
    }

    console.log(`[Quiz] User ${authorName} has not passed the quiz — removing post ${postId}`);

    // Remove the post
    try {
      const post = await reddit.getPostById(postId);
      await post.remove(true); // true = treat as spam removal

      // Leave a comment explaining why, with a link to the quiz
      const quizPostId = await redis.get('quiz:active_post_id');
      const quizLink = quizPostId
        ? `https://reddit.com/post/${quizPostId}`
        : null;

      const commentText = quizLink
        ? `Hi u/${authorName}, your post was automatically removed because you haven't passed our community rules quiz yet.\n\n👉 **[Click here to take the quiz](${quizLink})** — it only takes a few minutes!\n\nOnce you pass, your posting privileges will be unlocked automatically.`
        : `Hi u/${authorName}, your post was removed because you haven't completed our onboarding quiz yet. Please look for the pinned quiz post in this subreddit to unlock posting privileges.`;

      const comment = await post.addComment({ text: commentText });

      // Lock the comment so the bot doesn't get reply-spam
      await comment.lock();

      console.log(`[Quiz] Post ${postId} removed and comment left for ${authorName}`);
    } catch (removeError) {
      console.error(`[Quiz] Failed to remove post ${postId}:`, removeError);
    }

    return c.json<TriggerResponse>({}, 200);
  } catch (error) {
    console.error('[Quiz] Error in OnPostSubmit handler:', error);
    return c.json<TriggerResponse>({}, 200);
  }
});

/**
 * POST /internal/triggers/on-mod-action
 * Handles moderator actions from the Devvit trigger pipeline.
 */
triggers.post('/on-mod-action', async (c) => {
  try {
    const input = (await c.req.json()) as OnModActionRequest;
    console.log('[Quiz] OnModAction triggered', input);
    return c.json<TriggerResponse>({}, 200);
  } catch (error) {
    console.error('[Quiz] Error in OnModAction handler:', error);
    return c.json<TriggerResponse>({}, 200);
  }
});