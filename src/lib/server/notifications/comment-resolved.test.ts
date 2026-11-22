import { describe, expect, it } from 'vitest';
import { loadNote } from '../notes/access';
import { createNoteComment, setNoteCommentResolved } from '../notes/discussion';
import { createNote } from '../notes/notes';
import { createComment, listComments, setCommentResolved } from '../posts/comments';
import { loadPost, parseBody, type BodyInput } from '../posts/posts';
import { postWorld, textDoc } from '../testing/post-world';
import { listInbox } from './inbox';

const body = (text: string) => parseBody(textDoc(text)) as BodyInput;

async function commentWorld() {
	const w = await postWorld();
	const bo = await w.person('Bo');
	const post = await loadPost(w.env, bo, w.postId);
	const commentId = await createComment(w.env, bo, post, body('Is this done?'), null);
	await w.deliverJobs();
	const inboxOf = async (who: typeof bo) =>
		(await listInbox(w.env, who, 'unread'))
			.filter((row) => row.kind === 'comment_resolved')
			.map(({ title, url, count }) => ({ title, url, count }));
	return { ...w, bo, post, commentId, inboxOf };
}

describe('resolving a comment on a post', () => {
	it('tells its author once, however often it is resolved and opened again', async () => {
		const w = await commentWorld();
		const resolve = async (resolved: boolean) => {
			await setCommentResolved(w.env, w.author, w.post, w.commentId, resolved);
			await w.deliverJobs();
		};
		await resolve(true);
		await resolve(false);
		await resolve(true);

		expect(await w.inboxOf(w.bo)).toEqual([
			{ title: 'Plan', url: `/posts/${w.postId}#comment-${w.commentId}`, count: 1 }
		]);
	});

	it('keeps who resolved it, and when, until it is opened again', async () => {
		const w = await commentWorld();
		await setCommentResolved(w.env, w.author, w.post, w.commentId, true, 5000);
		expect((await listComments(w.env, w.postId))[0]).toMatchObject({
			resolvedAt: 5000,
			resolvedByName: 'Ada'
		});
		await setCommentResolved(w.env, w.author, w.post, w.commentId, false);
		expect((await listComments(w.env, w.postId))[0]).toMatchObject({
			resolvedAt: null,
			resolvedByName: null
		});
	});

	it('tells nobody when the author resolves their own comment', async () => {
		const w = await commentWorld();
		await setCommentResolved(w.env, w.bo, w.post, w.commentId, true);
		await w.deliverJobs();
		expect(await w.inboxOf(w.bo)).toEqual([]);
	});

	it('refuses a viewer, and a reply, and changes nothing', async () => {
		const w = await commentWorld();
		const vic = await w.person('Vic', 'viewer');
		const replyId = await createComment(w.env, w.bo, w.post, body('Yes'), w.commentId);
		const refused = (who: typeof vic, id: string) =>
			setCommentResolved(w.env, who, w.post, id, true).then(
				() => 'resolved',
				(e: { status: number }) => e.status
			);

		expect(await refused(vic, w.commentId), 'a viewer').toBe(403);
		expect(await refused(w.author, replyId), 'a reply').toBe(400);
		expect((await listComments(w.env, w.postId))[0].resolvedAt).toBeNull();
	});
});

describe('resolving a comment on a note', () => {
	it('tells its author once', async () => {
		const w = await postWorld();
		const bo = await w.person('Bo');
		const noteId = await createNote(w.env, w.author, { title: 'Notes', ...body('Notes') });
		w.sqlite.prepare("INSERT INTO note_shares VALUES (?, ?, 'view', 0)").run(noteId, bo.user.id);
		const note = await loadNote(w.env, bo, noteId);
		const commentId = await createNoteComment(w.env, bo, note, body('Typo here'), null);
		await w.deliverJobs();

		await setNoteCommentResolved(w.env, w.author, note, commentId, true);
		await w.deliverJobs();

		const rows = (await listInbox(w.env, bo, 'unread')).filter(
			(row) => row.kind === 'comment_resolved'
		);
		expect(rows.map(({ title, url, count }) => ({ title, url, count }))).toEqual([
			{ title: 'Notes', url: `/notes/${noteId}#comment-${commentId}`, count: 1 }
		]);
	});
});
