import { describe, expect, it, vi } from 'vitest';
import type { SignedIn } from '../auth/session';
import type { DomainEvent, JobMessage } from '../events';
import { deliverFollowUps } from '../follow-ups';
import { consumeJobs, runCron } from '../jobs';
import { loadNote } from '../notes/access';
import { createNoteComment, deleteNoteComment } from '../notes/discussion';
import { createNote, deleteNote } from '../notes/notes';
import { deleteComment } from '../posts/comments';
import { deletePost, loadPost } from '../posts/posts';
import { commentBody, notificationWorld } from './testing/world';

async function deliver(env: Env, event: DomainEvent) {
	const message = { body: { ...event, emittedAt: 1 } as JobMessage, ack: vi.fn(), retry: vi.fn() };
	await consumeJobs({ messages: [message] } as unknown as MessageBatch<JobMessage>, env);
	expect(message.retry, 'the job failed; see job_log for the error').not.toHaveBeenCalled();
	expect(message.ack).toHaveBeenCalled();
}

const as = (id: string): SignedIn => ({
	user: {
		id,
		name: id,
		username: `u-${id}`,
		email: `${id}@example.com`,
		avatarUrl: null,
		theme: 'system'
	},
	member: { id: `m-${id}`, role: 'member' }
});

/** ada's post p1 in project pr, which bo and cy follow, with bo's comment c1 and cy's reply r1. */
function postWithComments() {
	const w = notificationWorld();
	for (const id of ['ada', 'bo', 'cy']) w.person(id);
	w.project('pr', 'ada', { members: ['bo', 'cy'] });
	w.post('p1', 'pr', 'ada');
	w.comment('c1', 'p1', 'bo');
	w.comment('r1', 'p1', 'cy', 'c1');
	return w;
}

async function notifyAboutPost(env: Env) {
	await deliver(env, { kind: 'post.created', postId: 'p1', projectId: 'pr', authorId: 'ada' });
	await deliver(env, { kind: 'comment.created', commentId: 'c1', subjectId: 'p1', authorId: 'bo' });
	await deliver(env, { kind: 'comment.created', commentId: 'r1', subjectId: 'p1', authorId: 'cy' });
	await deliver(env, {
		kind: 'mention',
		subjectType: 'comment',
		subjectId: 'c1',
		mentionedUserId: 'cy',
		authorId: 'bo'
	});
}

/** ada's request for bo's feedback on p1, delivered, and reminders shown to their owners. */
async function askAndRemind(w: ReturnType<typeof notificationWorld>, reminders: string[][]) {
	w.sqlite
		.prepare("INSERT INTO post_feedback_requests VALUES ('fr1', 'p1', 'bo', 'ada', 0, NULL, NULL)")
		.run();
	await deliver(w.env, { kind: 'feedback.requested', requestId: 'fr1' });
	for (const [userId, type, id] of reminders) {
		w.sqlite
			.prepare("INSERT INTO follow_ups VALUES (?, ?, ?, ?, 'T', '/', 0, NULL, 0, 1)")
			.run(`fu-${userId}-${id}`, userId, type, id);
	}
	await deliverFollowUps(w.env, 1);
}

describe('deleting content takes back its notifications', () => {
	it('removes every notification about a deleted post and publishes the new unread counts', async () => {
		const w = postWithComments();
		await notifyAboutPost(w.env);
		expect(w.notificationsFor('ada'), 'the comment and the reply').toHaveLength(2);
		expect(w.notificationsFor('bo'), 'the post and the reply').toHaveLength(2);
		expect(
			w.notificationsFor('cy'),
			'the post, the mention and Bo’s comment (Cy follows the post by replying)'
		).toHaveLength(3);
		w.published.length = 0;

		await deletePost(w.env, as('ada'), await loadPost(w.env, as('ada'), 'p1'));

		for (const id of ['ada', 'bo', 'cy']) expect(w.notificationsFor(id)).toEqual([]);
		for (const id of ['ada', 'bo', 'cy']) {
			expect(w.published).toContainEqual({
				topic: `user:${id}`,
				payload: { type: 'inbox.unread', count: 0 }
			});
		}
	});

	it('removes the notifications about a deleted comment and its replies, and keeps the post’s', async () => {
		const w = postWithComments();
		await notifyAboutPost(w.env);

		await deleteComment(w.env, as('bo'), await loadPost(w.env, as('bo'), 'p1'), 'c1');

		expect(w.notificationsFor('ada')).toEqual([]);
		expect(w.notificationsFor('bo')).toEqual([
			{ kind: 'post', actor_id: 'ada', item_key: 'post:p1', url: '/posts/p1' }
		]);
		expect(w.notificationsFor('cy')).toEqual([
			{ kind: 'post', actor_id: 'ada', item_key: 'post:p1', url: '/posts/p1' }
		]);
	});

	it('removes the reactions to a deleted post and to its comments', async () => {
		const w = postWithComments();
		const react = async (id: string, type: 'post' | 'comment', subjectId: string, by: string) => {
			w.sqlite
				.prepare("INSERT INTO reactions VALUES (?, ?, ?, ?, '👍', 0)")
				.run(id, type, subjectId, by);
			await deliver(w.env, {
				kind: 'reaction.created',
				reactionId: id,
				subjectType: type,
				subjectId,
				authorId: by
			});
		};
		await react('x1', 'post', 'p1', 'bo');
		await react('x2', 'comment', 'c1', 'cy');
		expect(w.notificationsFor('ada').map((row) => row.kind)).toEqual(['reaction']);
		expect(w.notificationsFor('bo').map((row) => row.kind)).toEqual(['reaction']);

		await deletePost(w.env, as('ada'), await loadPost(w.env, as('ada'), 'p1'));

		expect(w.notificationsFor('ada')).toEqual([]);
		expect(w.notificationsFor('bo')).toEqual([]);
	});

	it('removes every notification about a deleted note', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		w.note('n1', 'ada', ['bo']);
		await deliver(w.env, {
			kind: 'note.shared',
			noteId: 'n1',
			sharedWith: ['bo'],
			authorId: 'ada'
		});
		await deliver(w.env, {
			kind: 'mention',
			subjectType: 'note',
			subjectId: 'n1',
			mentionedUserId: 'bo',
			authorId: 'ada'
		});
		expect(w.notificationsFor('bo')).toHaveLength(2);

		await deleteNote(w.env, as('ada'), await loadNote(w.env, as('ada'), 'n1'));

		expect(w.notificationsFor('bo')).toEqual([]);
	});

	it('removes the notifications about a deleted note comment and its replies, and keeps the rest', async () => {
		const w = notificationWorld();
		for (const id of ['ada', 'bo', 'cy']) w.person(id);
		const noteId = await createNote(w.env, as('ada'), { title: 'Plan', ...commentBody('Plan') });
		w.sqlite
			.prepare("INSERT INTO note_shares VALUES (?, 'bo', 'view', 0), (?, 'cy', 'view', 0)")
			.run(noteId, noteId);
		const comment = async (who: string, replyTo: string | null = null) => {
			const note = await loadNote(w.env, as(who), noteId);
			const id = await createNoteComment(w.env, as(who), note, commentBody(who), replyTo);
			for (const job of w.jobs.splice(0)) await deliver(w.env, job);
			return id;
		};
		const kept = await comment('bo');
		const doomed = await comment('cy');
		await comment('bo', doomed);
		expect(w.notificationsFor('ada'), 'two comments and a reply').toHaveLength(3);

		await deleteNoteComment(w.env, as('cy'), await loadNote(w.env, as('cy'), noteId), doomed);

		expect(w.notificationsFor('ada')).toEqual([
			expect.objectContaining({ url: `/notes/${noteId}#comment-${kept}` })
		]);
		expect(w.notificationsFor('bo'), 'cy’s comment, gone').toEqual([]);
	});

	it('leaves nothing for the unread email or the digest to send', async () => {
		// An hour later it is 08:00 UTC, the default digest hour, and cy's mention is emailed by default.
		const now = Date.UTC(2026, 10, 18, 7, 0);
		vi.useFakeTimers({ now, toFake: ['Date'] });
		try {
			const w = postWithComments();
			await notifyAboutPost(w.env);
			await deletePost(w.env, as('ada'), await loadPost(w.env, as('ada'), 'p1'));

			const later = now + 60 * 60 * 1000;
			await runCron({ cron: '*/5 * * * *', scheduledTime: later } as ScheduledController, w.env);
			await runCron({ cron: '0 * * * *', scheduledTime: later } as ScheduledController, w.env);

			expect(w.sqlite.prepare('SELECT subject FROM dev_mail').all()).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('deleting content takes back its feedback requests and shown reminders', () => {
	it('removes them with a deleted post, reminders on its comments included', async () => {
		const w = postWithComments();
		await askAndRemind(w, [
			['bo', 'post', 'p1'],
			['cy', 'comment', 'c1']
		]);
		expect(
			w
				.notificationsFor('bo')
				.map((row) => row.item_key)
				.sort()
		).toEqual(['feedback:fr1', 'follow_up:fu-bo-p1']);
		expect(w.notificationsFor('cy').map((row) => row.item_key)).toEqual(['follow_up:fu-cy-c1']);
		w.published.length = 0;

		await deletePost(w.env, as('ada'), await loadPost(w.env, as('ada'), 'p1'));

		expect(w.notificationsFor('bo')).toEqual([]);
		expect(w.notificationsFor('cy')).toEqual([]);
		for (const id of ['bo', 'cy']) {
			expect(w.published).toContainEqual({
				topic: `user:${id}`,
				payload: { type: 'inbox.unread', count: 0 }
			});
		}
	});

	it('removes reminders on a deleted comment and its replies, and keeps the post’s', async () => {
		const w = postWithComments();
		await askAndRemind(w, [
			['bo', 'post', 'p1'],
			['ada', 'comment', 'c1'],
			['bo', 'comment', 'r1']
		]);

		await deleteComment(w.env, as('bo'), await loadPost(w.env, as('bo'), 'p1'), 'c1');

		expect(w.notificationsFor('ada')).toEqual([]);
		expect(
			w
				.notificationsFor('bo')
				.map((row) => row.item_key)
				.sort()
		).toEqual(['feedback:fr1', 'follow_up:fu-bo-p1']);
	});

	it('removes a reminder on a deleted note', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		w.note('n1', 'ada', ['bo']);
		w.sqlite
			.prepare("INSERT INTO follow_ups VALUES ('fu1', 'bo', 'note', 'n1', 'N', '/', 0, NULL, 0, 1)")
			.run();
		await deliverFollowUps(w.env, 1);
		expect(w.notificationsFor('bo')).toHaveLength(1);

		await deleteNote(w.env, as('ada'), await loadNote(w.env, as('ada'), 'n1'));

		expect(w.notificationsFor('bo')).toEqual([]);
	});
});

describe('deleting content with more comments than D1 binds parameters', () => {
	it('deletes a post with 100 comments and takes back a reminder on the last', async () => {
		const w = postWithComments();
		for (let i = 0; i < 100; i++) w.comment(`many${i}`, 'p1', 'bo');
		await askAndRemind(w, [['cy', 'comment', 'many99']]);

		await deletePost(w.env, as('ada'), await loadPost(w.env, as('ada'), 'p1'));

		expect(w.sqlite.prepare("SELECT id FROM posts WHERE id = 'p1'").all()).toEqual([]);
		expect(w.notificationsFor('cy')).toEqual([]);
	});

	it('deletes a comment with 50 replies and takes back their notifications', async () => {
		const w = postWithComments();
		for (let i = 0; i < 50; i++) {
			w.comment(`many${i}`, 'p1', 'cy', 'c1');
			await deliver(w.env, {
				kind: 'comment.created',
				commentId: `many${i}`,
				subjectId: 'p1',
				authorId: 'cy'
			});
		}
		expect(w.notificationsFor('ada')).toHaveLength(50);

		await deleteComment(w.env, as('bo'), await loadPost(w.env, as('bo'), 'p1'), 'c1');

		expect(w.sqlite.prepare("SELECT id FROM comments WHERE id = 'c1'").all()).toEqual([]);
		expect(w.notificationsFor('ada')).toEqual([]);
	});
});

describe('an event about content deleted before it was handled', () => {
	it('notifies nobody and is acked', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		w.project('pr', 'ada', { members: ['bo'] });
		const events: DomainEvent[] = [
			{ kind: 'post.created', postId: 'gone', projectId: 'pr', authorId: 'ada' },
			{ kind: 'comment.created', commentId: 'gone', subjectId: 'gone', authorId: 'ada' },
			{ kind: 'note.shared', noteId: 'gone', sharedWith: ['bo'], authorId: 'ada' },
			{ kind: 'note.commented', commentId: 'gone', noteId: 'gone', authorId: 'ada' },
			...(['post', 'comment', 'note'] as const).map((subjectType) => ({
				kind: 'mention' as const,
				subjectType,
				subjectId: 'gone',
				mentionedUserId: 'bo',
				authorId: 'ada'
			}))
		];
		for (const event of events) await deliver(w.env, event);
		expect(w.notificationsFor('bo')).toEqual([]);
	});
});
