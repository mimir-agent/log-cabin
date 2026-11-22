import { describe, expect, it } from 'vitest';
import { createComment } from '../posts/comments';
import { loadPost, parseBody, resolvePost, unresolvePost, type BodyInput } from '../posts/posts';
import { postWorld, textDoc } from '../testing/post-world';
import { listInbox } from './inbox';

const body = (text: string) => parseBody(textDoc(text)) as BodyInput;

/** Ada's post "Plan", with Bo and Cy following it and Bo's comment on it; Zed is an admin. */
async function resolveWorld() {
	const w = await postWorld();
	const bo = await w.person('Bo');
	const cy = await w.person('Cy');
	const zed = await w.person('Zed', 'admin');
	const post = await loadPost(w.env, bo, w.postId);
	const commentId = await createComment(w.env, bo, post, body('Is this done?'), null);
	await createComment(w.env, cy, post, body('Not sure'), null);
	await w.deliverJobs();
	const resolved = await loadPost(w.env, w.author, w.postId);
	const inboxOf = async (who: typeof bo) =>
		(await listInbox(w.env, who, 'unread'))
			.filter((row) => row.kind.startsWith('post_resolved'))
			.map(({ kind, title, url }) => ({ kind, title, url }));
	return { ...w, bo, cy, zed, post: resolved, commentId, inboxOf };
}

describe('resolving a post', () => {
	it('keeps the written resolution until the post is opened again', async () => {
		const w = await resolveWorld();
		const resolution = parseBody(textDoc('Shipped on Friday')) as BodyInput;
		await resolvePost(w.env, w.author, w.post, null, resolution.body);
		expect((await loadPost(w.env, w.author, w.postId)).resolvedBody).toBe(resolution.body);

		await unresolvePost(w.env, w.author, w.post);
		const reopened = await loadPost(w.env, w.author, w.postId);
		expect(reopened).toMatchObject({ resolvedAt: null, resolvedBody: null });
	});

	it('tells the people following it, in the words of Campsite, but not who resolved it', async () => {
		const w = await resolveWorld();
		await resolvePost(w.env, w.zed, w.post, null, null);
		await w.deliverJobs();

		const row = { kind: 'post_resolved', title: 'Plan', url: `/posts/${w.postId}` };
		expect(await w.inboxOf(w.author)).toEqual([row]);
		expect(await w.inboxOf(w.bo)).toEqual([row]);
		expect(await w.inboxOf(w.cy)).toEqual([row]);
		expect(await w.inboxOf(w.zed)).toEqual([]);
		expect(
			w.sqlite.prepare('SELECT summary FROM notifications WHERE user_id = ?').get(w.bo.user.id)
		).toEqual({ summary: 'Zed resolved Plan' });
	});

	it('tells a comment’s author that it resolved the post, and everyone else only that it is resolved', async () => {
		const w = await resolveWorld();
		await resolvePost(w.env, w.author, w.post, w.commentId, null);
		await w.deliverJobs();

		const row = (kind: string) => ({ kind, title: 'Plan', url: `/posts/${w.postId}` });
		expect(await w.inboxOf(w.bo)).toEqual([row('post_resolved_from_comment')]);
		expect(await w.inboxOf(w.cy)).toEqual([row('post_resolved')]);
		expect(await w.inboxOf(w.author)).toEqual([]);
	});

	it('tells them again when it is resolved again after being opened', async () => {
		const w = await resolveWorld();
		await resolvePost(w.env, w.zed, w.post, null, null, 1000);
		await unresolvePost(w.env, w.zed, w.post);
		await resolvePost(w.env, w.zed, w.post, null, null, 2000);
		await w.deliverJobs();
		const rows = w.sqlite
			.prepare("SELECT source FROM notifications WHERE kind = 'post_resolved' AND user_id = ?")
			.all(w.bo.user.id);
		expect(rows).toHaveLength(2);
	});

	it('does nothing when it is resolved twice, and keeps the first resolution', async () => {
		const w = await resolveWorld();
		const first = parseBody(textDoc('First')) as BodyInput;
		const second = parseBody(textDoc('Second')) as BodyInput;
		await resolvePost(w.env, w.zed, w.post, null, first.body, 1000);
		await resolvePost(w.env, w.zed, w.post, null, second.body, 2000);
		await w.deliverJobs();
		const rows = w.sqlite
			.prepare("SELECT source FROM notifications WHERE kind = 'post_resolved' AND user_id = ?")
			.all(w.bo.user.id);
		expect(rows).toHaveLength(1);
		expect((await loadPost(w.env, w.author, w.postId)).resolvedBody).toBe(first.body);
	});
});
