import { describe, expect, it } from 'vitest';
import { createComment } from '../posts/comments';
import { loadPost, parseBody, type BodyInput } from '../posts/posts';
import { toggleReaction } from '../posts/reactions';
import { postWorld, textDoc } from '../testing/post-world';
import { listInbox } from './inbox';

async function reactionWorld() {
	const w = await postWorld();
	const bo = await w.person('Bo');
	const cy = await w.person('Cy');
	const react = async (who: typeof bo, subject: { type: 'post' | 'comment'; id: string }) => {
		await toggleReaction(w.env, who, await loadPost(w.env, who, w.postId), subject, '👍');
		await w.deliverJobs();
	};
	return { ...w, bo, cy, react };
}

describe('reaction notifications', () => {
	it('tells the author of a post about its reactions, as one inbox row', async () => {
		const w = await reactionWorld();
		await w.react(w.bo, { type: 'post', id: w.postId });
		await w.react(w.cy, { type: 'post', id: w.postId });

		const inbox = await listInbox(w.env, w.author, 'unread');
		expect(inbox.map(({ kind, title, url, count }) => ({ kind, title, url, count }))).toEqual([
			{ kind: 'reaction', title: 'Plan', url: `/posts/${w.postId}`, count: 2 }
		]);
	});

	it('tells the author of a comment, in a row of its own beside the post’s', async () => {
		const w = await reactionWorld();
		const post = await loadPost(w.env, w.bo, w.postId);
		const commentId = await createComment(
			w.env,
			w.bo,
			post,
			parseBody(textDoc('Looks good')) as BodyInput,
			null
		);
		await w.deliverJobs();
		await w.react(w.cy, { type: 'comment', id: commentId });
		await w.react(w.cy, { type: 'post', id: w.postId });

		const bos = await listInbox(w.env, w.bo, 'unread');
		expect(bos.map((row) => [row.kind, row.url])).toEqual([
			['reaction', `/posts/${w.postId}#comment-${commentId}`]
		]);
		const adas = (await listInbox(w.env, w.author, 'unread')).filter(
			(row) => row.kind === 'reaction'
		);
		expect(
			adas.map((row) => row.url),
			'the post’s reactions are Ada’s, not Bo’s'
		).toEqual([`/posts/${w.postId}`]);
	});

	it('never tells anyone about their own reaction', async () => {
		const w = await reactionWorld();
		await w.react(w.author, { type: 'post', id: w.postId });
		expect(await listInbox(w.env, w.author, 'unread')).toEqual([]);
	});

	it('takes the notification back when the reaction is taken back', async () => {
		const w = await reactionWorld();
		await w.react(w.bo, { type: 'post', id: w.postId });
		expect(await listInbox(w.env, w.author, 'unread')).toHaveLength(1);
		await w.react(w.bo, { type: 'post', id: w.postId });
		expect(await listInbox(w.env, w.author, 'unread')).toEqual([]);
	});

	it('tells nobody about a reaction taken back before its job runs', async () => {
		const w = await reactionWorld();
		const post = await loadPost(w.env, w.bo, w.postId);
		const subject = { type: 'post' as const, id: w.postId };
		await toggleReaction(w.env, w.bo, post, subject, '👍');
		await toggleReaction(w.env, w.bo, post, subject, '👍');
		await w.deliverJobs();
		expect(await listInbox(w.env, w.author, 'unread')).toEqual([]);
	});
});
