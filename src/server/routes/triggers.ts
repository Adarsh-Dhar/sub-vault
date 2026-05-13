/**
 * Trigger handlers for the quiz onboarding app
 */

import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { context, reddit, redis } from '@devvit/web/server';
import { generateQuiz, checkDangerousContent } from '../services/gemini';
import {
  checkVeteranStatus,
  getQuizSettings,
  getSubredditRulesText,
  assignPassFlair,
} from '../services/quiz-data';
import type { QuizState } from '../../shared/quiz-types';
import type { OnModActionRequest } from '@devvit/web/shared';

export const triggers = new Hono();

/**
 * POST /internal/triggers/on-subscribe
 * Triggered automatically when a new user subscribes to the subreddit.
 * 
 * Flow:
 * 1. Check if user is veteran (account age > X days OR karma > Y)
 *    - If veteran: Grant flair + send welcome DM (if enabled) + skip quiz
 *    - If not veteran: Generate quiz and send quiz invite DM
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

    // Check if user qualifies for veteran bypass
    const isVeteran = await checkVeteranStatus(username);

    if (isVeteran) {
      console.log(`[Quiz] User ${username} is veteran, bypassing quiz`);
      
      // Grant flair immediately
      try {
        await assignPassFlair(username, quizSettings.pass_flair_text);
        await redis.set(`quiz:passed:${userId}`, 'true');
        await redis.set(`quiz:passed:${username}`, 'true');
      } catch (err) {
        console.warn(`[Quiz] Failed to grant veteran flair to ${username}:`, err);
      }

      // Send welcome DM if enabled (but not the on-quiz-pass DM, just a simple welcome)
      if (quizSettings.welcome_dm_enabled) {
        try {
          const linksArray = JSON.parse(quizSettings.welcome_dm_links) as Array<{ label: string; url: string }>;
          const linksText = linksArray
            .map((link) => `• [${link.label}](${link.url})`)
            .join('\n');

          const dmText = `Welcome to the community! 🎉\n\nYour account qualifies for veteran status, so you've been automatically granted posting privileges.\n\n**Helpful Resources:**\n${linksText}\n\nHappy posting!`;

          await reddit.sendPrivateMessage({
            to: username,
            subject: 'Welcome! Veteran Status Granted',
            text: dmText,
          });
          console.log(`[Quiz] Veteran welcome DM sent to ${username}`);
        } catch (dmError) {
          console.warn(`[Quiz] Could not send veteran welcome DM to ${username}:`, dmError);
        }
      }

      return c.json<TriggerResponse>({}, 200);
    }

    // Non-veteran: Generate quiz
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

    // Check both keys: userId (set via on-subscribe) and username (always set on quiz submit)
    const [hasPassedById, hasPassedByName] = await Promise.all([
      redis.get(`quiz:passed:${authorId}`),
      redis.get(`quiz:passed:${authorName}`),
    ]);
    const hasPassed = hasPassedById === 'true' || hasPassedByName === 'true' ? 'true' : null;

    if (hasPassed === 'true') {
      // User passed the quiz — still run an AI "vibe check" for dangerous content
      try {
        const post = await reddit.getPostById(postId);
        const vibeCheck = await checkDangerousContent(post.title, (post as any).selftext || '');

        if (vibeCheck.isDangerous) {
          console.log(`[Quiz] Dangerous post detected from ${authorName}: ${vibeCheck.reason}`);

          const subredditName = context.subredditName;
          if (subredditName) {
            try {
              await reddit.setPostFlair({
                subredditName,
                postId,
                text: 'Dangerous',
                backgroundColor: '#000000',
              });
            } catch (flairErr) {
              console.warn(`[Quiz] Could not set Dangerous flair on ${postId}:`, flairErr);
            }
          }

          await post.remove(true);

          const comment = await post.addComment({
            text: `This post was automatically removed by AI moderation because it was flagged as dangerous/violating.\n\n**Reason:** ${vibeCheck.reason ?? 'Flagged by AI'}`
          });
          await comment.lock();

          return c.json<TriggerResponse>({}, 200);
        }
      } catch (err) {
        console.error('[Quiz] Failed to run dangerous content check:', err);
      }

      // If it's not dangerous, let it through normally
      return c.json<TriggerResponse>({}, 200);
    }

    console.log(`[Quiz] User ${authorName} has not passed the quiz — removing post ${postId}`);

    // Remove the post
    try {
      const post = await reddit.getPostById(postId);

      // 1. Tag the post for moderation logs (non-fatal)
      const subredditName = context.subredditName;
      if (subredditName) {
        try {
          await reddit.setPostFlair({
            subredditName,
            postId,
            text: 'Pending Quiz',
            backgroundColor: '#FF4500',
          });
          console.log(`[Quiz] Post ${postId} tagged with "Pending Quiz" flair`);
        } catch (flairError) {
          // Flair failure is non-fatal — still remove the post
          console.warn(`[Quiz] Could not set flair on post ${postId}:`, flairError);
        }
      }

      // 2. Instantly remove the post (spam classification keeps it off all feeds)
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