import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DomainEvent, JobMessage } from '../events';
import { consumeJobs, runCron } from '../jobs';
import { loadNote } from '../notes/access';
import { createNoteComment } from '../notes/discussion';
import { createNote } from '../notes/notes';
import { createComment } from '../posts/comments';
import { loadPost, parseBody, type BodyInput } from '../posts/posts';
import { postWorld, textDoc } from '../testing/post-world';
import { commentBody, notificationWorld, signedIn } from './testing/world';

async function deliver(env: Env, event: DomainEvent) {
	const message = { body: { ...event, emittedAt: 1 } as JobMessage, ack: vi.fn(), retry: vi.fn() };
	await consumeJobs({ messages: [message] } as unknown as MessageBatch<JobMessage>, env);
	expect(message.retry, 'the job failed; see job_log for the error').not.toHaveBeenCalled();
	expect(message.ack).toHaveBeenCalled();
}

afterEach(() => {
	vi.unstubAllGlobals();
});

type World = ReturnType<typeof notificationWorld>;

/** ada's note "Plan", which bo and cy may view. */
async function sharedNote(w: World) {
	for (const id of ['ada', 'bo', 'cy']) w.person(id);
	const noteId = await createNote(w.env, signedIn('ada'), {
		title: 'Plan',
		...commentBody('The plan')
	});
	const share = w.sqlite.prepare("INSERT INTO note_shares VALUES (?, ?, 'view', 0)");
	for (const id of ['bo', 'cy']) share.run(noteId, id);
	return noteId;
}

/** Comments on the note as this person, then runs the jobs the comment emitted. */
async function commentOnNote(w: World, noteId: string, who: string, mentions: string[] = []) {
	const note = await loadNote(w.env, signedIn(who), noteId);
	const body = commentBody(`From ${who}`, mentions);
	const id = await createNoteComment(w.env, signedIn(who), note, body, null);
	for (const job of w.jobs.splice(0)) await deliver(w.env, job);
	return id;
}

const commentsFor = (w: World, userId: string) =>
	w.notificationsFor(userId).filter((row) => row.kind === 'comment');

describe('telling a note’s author and commenters about a new comment', () => {
	it('tells the author of a comment on their note, then the author and that commenter of the next', async () => {
		const w = notificationWorld();
		const noteId = await sharedNote(w);

		const first = await commentOnNote(w, noteId, 'bo');
		expect(w.notificationsFor('ada')).toEqual([
			{
				kind: 'comment',
				actor_id: 'bo',
				item_key: `note:${noteId}`,
				url: `/notes/${noteId}#comment-${first}`
			}
		]);
		const title = w.sqlite.prepare("SELECT title FROM notifications WHERE user_id = 'ada'").get();
		expect(title, 'the inbox shows the note’s title').toEqual({ title: 'Plan' });

		const second = await commentOnNote(w, noteId, 'cy');
		expect(commentsFor(w, 'ada').map((row) => row.url)).toEqual([
			`/notes/${noteId}#comment-${first}`,
			`/notes/${noteId}#comment-${second}`
		]);
		expect(commentsFor(w, 'bo'), 'bo commented, so hears of cy’s').toEqual([
			expect.objectContaining({ actor_id: 'cy', url: `/notes/${noteId}#comment-${second}` })
		]);
		expect(commentsFor(w, 'cy'), 'not of their own comment').toEqual([]);
	});

	it('tells nobody who can no longer see the note', async () => {
		const w = notificationWorld();
		const noteId = await sharedNote(w);
		await commentOnNote(w, noteId, 'bo');
		w.sqlite.prepare("DELETE FROM note_shares WHERE user_id = 'bo'").run();

		await commentOnNote(w, noteId, 'cy');
		expect(commentsFor(w, 'bo'), 'bo’s share was removed').toEqual([]);
		expect(commentsFor(w, 'ada')).toHaveLength(2);
	});

	it('tells a subscriber the comment mentions only of the mention', async () => {
		const w = notificationWorld();
		const noteId = await sharedNote(w);
		await commentOnNote(w, noteId, 'bo');

		await commentOnNote(w, noteId, 'cy', ['bo']);
		expect(w.notificationsFor('bo')).toEqual([
			{ kind: 'mention', actor_id: 'cy', item_key: `note:${noteId}`, url: `/notes/${noteId}` }
		]);
	});

	it('still puts it in the inbox of someone who turned comment push and email off, and sends neither', async () => {
		const w = notificationWorld({
			VAPID_PUBLIC_KEY:
				'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
			VAPID_PRIVATE_KEY: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'
		});
		const noteId = await sharedNote(w);
		w.sqlite
			.prepare(
				"INSERT INTO push_subscriptions VALUES ('s1', 'ada', 'https://push.example.net/sub/1', 'k', 'a', 0)"
			)
			.run();
		w.sqlite
			.prepare(
				"INSERT INTO notification_settings VALUES ('ada', '[]', '[\"mention\"]', 0, 9, 0, 5, 17, NULL, NULL)"
			)
			.run();
		const fetch = vi.fn(async () => new Response(null, { status: 201 }));
		vi.stubGlobal('fetch', fetch);

		await commentOnNote(w, noteId, 'bo');
		const later = Date.now() + 11 * 60 * 1000;
		await runCron({ cron: '*/5 * * * *', scheduledTime: later } as ScheduledController, w.env);

		expect(commentsFor(w, 'ada'), 'in the inbox').toHaveLength(1);
		expect(fetch, 'no push').not.toHaveBeenCalled();
		expect(w.sqlite.prepare('SELECT subject FROM dev_mail').all(), 'no email').toEqual([]);
	});
});

describe('the JOBS consumer turns events into notifications', () => {
	it('notifies the person mentioned in a post, linking to the post', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		w.project('pr', 'ada');
		w.post('p1', 'pr', 'ada');
		await deliver(w.env, {
			kind: 'mention',
			subjectType: 'post',
			subjectId: 'p1',
			mentionedUserId: 'bo',
			authorId: 'ada'
		});
		expect(w.notificationsFor('bo')).toEqual([
			{ kind: 'mention', actor_id: 'ada', item_key: 'post:p1', url: '/posts/p1' }
		]);
		const titles = w.sqlite.prepare("SELECT title FROM notifications WHERE user_id = 'bo'").all();
		expect(titles, 'the inbox shows the post’s title under the line').toEqual([{ title: 'T' }]);
	});

	it('notifies the person mentioned in a comment, linking to the comment', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		w.project('pr', 'ada');
		w.post('p1', 'pr', 'ada');
		w.comment('c1', 'p1', 'ada');
		await deliver(w.env, {
			kind: 'mention',
			subjectType: 'comment',
			subjectId: 'c1',
			mentionedUserId: 'bo',
			authorId: 'ada'
		});
		expect(w.notificationsFor('bo')).toEqual([
			{ kind: 'mention', actor_id: 'ada', item_key: 'post:p1', url: '/posts/p1#comment-c1' }
		]);
	});

	it('notifies the post author of a comment on their post', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		w.project('pr', 'ada');
		w.post('p1', 'pr', 'ada');
		w.comment('c1', 'p1', 'bo');
		await deliver(w.env, {
			kind: 'comment.created',
			commentId: 'c1',
			subjectId: 'p1',
			authorId: 'bo'
		});
		expect(w.notificationsFor('ada')).toEqual([
			{ kind: 'comment', actor_id: 'bo', item_key: 'post:p1', url: '/posts/p1#comment-c1' }
		]);
	});

	it('notifies the parent comment author of a reply, and the post author of the comment', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		w.person('cy');
		w.project('pr', 'ada');
		w.post('p1', 'pr', 'ada');
		w.comment('c1', 'p1', 'bo');
		w.comment('c2', 'p1', 'cy', 'c1');
		await deliver(w.env, {
			kind: 'comment.created',
			commentId: 'c2',
			subjectId: 'p1',
			authorId: 'cy'
		});
		expect(w.notificationsFor('bo')).toEqual([expect.objectContaining({ kind: 'reply' })]);
		expect(w.notificationsFor('ada')).toEqual([expect.objectContaining({ kind: 'comment' })]);
	});

	it('tells someone who wrote both the post and the parent comment once, as a reply', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		w.project('pr', 'ada');
		w.post('p1', 'pr', 'ada');
		w.comment('c1', 'p1', 'ada');
		w.comment('c2', 'p1', 'bo', 'c1');
		await deliver(w.env, {
			kind: 'comment.created',
			commentId: 'c2',
			subjectId: 'p1',
			authorId: 'bo'
		});
		expect(w.notificationsFor('ada')).toEqual([expect.objectContaining({ kind: 'reply' })]);
	});

	it('does not tell a parent comment author who unsubscribed of a reply', async () => {
		const w = notificationWorld();
		for (const id of ['ada', 'bo', 'cy']) w.person(id);
		w.project('pr', 'ada');
		w.post('p1', 'pr', 'ada');
		w.comment('c1', 'p1', 'bo');
		w.comment('c2', 'p1', 'cy', 'c1');
		w.sqlite.prepare("DELETE FROM post_subscriptions WHERE user_id = 'bo'").run();
		await deliver(w.env, {
			kind: 'comment.created',
			commentId: 'c2',
			subjectId: 'p1',
			authorId: 'cy'
		});
		expect(w.notificationsFor('bo')).toEqual([]);
	});

	it('tells a subscribed parent comment author of a reply once', async () => {
		const w = notificationWorld();
		for (const id of ['ada', 'bo', 'cy']) w.person(id);
		w.project('pr', 'ada');
		w.post('p1', 'pr', 'ada');
		w.comment('c1', 'p1', 'bo');
		w.comment('c2', 'p1', 'cy', 'c1');
		await deliver(w.env, {
			kind: 'comment.created',
			commentId: 'c2',
			subjectId: 'p1',
			authorId: 'cy'
		});
		expect(w.notificationsFor('bo')).toEqual([expect.objectContaining({ kind: 'reply' })]);
	});

	it('subscribes the author of a new top-level comment to the post', async () => {
		const w = await postWorld();
		const bo = await w.person('Bo');
		const post = await loadPost(w.env, bo, w.postId);
		await createComment(w.env, bo, post, parseBody(textDoc('Hi')) as BodyInput, null);
		const subscribers = w.sqlite
			.prepare('SELECT user_id FROM post_subscriptions WHERE post_id = ?')
			.all(w.postId);
		expect(subscribers).toContainEqual({ user_id: bo.user.id });
	});

	it('notifies everyone in a thread the message lists as recipients, linking to the thread', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		w.person('cy');
		w.thread('t1', ['ada', 'bo', 'cy']);
		w.message('m1', 't1', 'ada');
		await deliver(w.env, {
			kind: 'message.created',
			messageId: 'm1',
			threadId: 't1',
			authorId: 'ada',
			recipientIds: ['bo', 'cy']
		});
		for (const id of ['bo', 'cy']) {
			expect(w.notificationsFor(id)).toEqual([
				{ kind: 'message', actor_id: 'ada', item_key: 'thread:t1', url: '/chat/t1' }
			]);
		}
	});

	it('notifies a project’s subscribers once about a new post in it, and no one else', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		w.person('cy');
		w.person('di');
		w.project('pr', 'ada', { members: ['ada', 'bo'], favorites: ['cy'] });
		w.post('p1', 'pr', 'ada');
		await deliver(w.env, { kind: 'post.created', postId: 'p1', projectId: 'pr', authorId: 'ada' });
		expect(w.notificationsFor('bo')).toEqual([
			{ kind: 'post', actor_id: 'ada', item_key: 'post:p1', url: '/posts/p1' }
		]);
		expect(w.notificationsFor('cy'), 'cy favourited the project without subscribing').toEqual([]);
		expect(w.notificationsFor('di'), 'di neither joined nor favourited the project').toEqual([]);
	});

	it('does not notify a subscriber who was asked for feedback on the post', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		w.person('cy');
		w.project('pr', 'ada', { members: ['ada', 'bo', 'cy'] });
		w.post('p1', 'pr', 'ada');
		w.sqlite.exec(
			"INSERT INTO post_feedback_requests (id, post_id, user_id, requested_by, created_at) VALUES ('f1', 'p1', 'bo', 'ada', 0)"
		);
		await deliver(w.env, { kind: 'post.created', postId: 'p1', projectId: 'pr', authorId: 'ada' });
		expect(w.notificationsFor('bo')).toEqual([]);
		expect(w.notificationsFor('cy')).toHaveLength(1);
	});

	it('notifies the people a note is shared with', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		w.note('n1', 'ada');
		await deliver(w.env, {
			kind: 'note.shared',
			noteId: 'n1',
			sharedWith: ['bo'],
			authorId: 'ada'
		});
		expect(w.notificationsFor('bo')).toEqual([
			{ kind: 'note', actor_id: 'ada', item_key: 'note:n1', url: '/notes/n1' }
		]);
	});

	it('notifies someone on “Mentions and replies” only of a mention or a reply to them, and someone on “Off” of nothing', async () => {
		const w = notificationWorld();
		for (const id of ['ada', 'bo', 'cy']) w.person(id);
		w.thread('t1', ['ada', 'bo', 'cy']);
		const level = w.sqlite.prepare(
			'UPDATE chat_thread_members SET notification_level = ? WHERE user_id = ?'
		);
		level.run('mentions', 'bo');
		level.run('none', 'cy');
		const mentionOf = (userId: string) => ({
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'mention', attrs: { id: userId, label: userId } }] }
			]
		});
		w.message('plain', 't1', 'ada');
		w.message('to-bo', 't1', 'ada', mentionOf('bo'));
		w.message('bos', 't1', 'bo');
		w.message('reply', 't1', 'ada', undefined, 'bos');
		w.message('to-cy', 't1', 'ada', mentionOf('cy'));
		for (const messageId of ['plain', 'to-bo', 'reply', 'to-cy']) {
			await deliver(w.env, {
				kind: 'message.created',
				messageId,
				threadId: 't1',
				authorId: 'ada',
				recipientIds: ['bo', 'cy']
			});
		}
		const sources = (userId: string) =>
			w.sqlite
				.prepare('SELECT source FROM notifications WHERE user_id = ? ORDER BY rowid')
				.all(userId);
		expect(sources('bo')).toEqual([
			{ source: 'message.created:to-bo' },
			{ source: 'message.created:reply' }
		]);
		expect(sources('cy')).toEqual([]);
	});

	it('tells nobody about a message deleted, alone or with its thread, before the job ran', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		await deliver(w.env, {
			kind: 'message.created',
			messageId: 'm-gone',
			threadId: 't-gone',
			authorId: 'ada',
			recipientIds: ['bo']
		});
		expect(w.notificationsFor('bo')).toEqual([]);
	});

	it('never notifies anyone of their own action', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.note('n1', 'ada');
		w.project('pr', 'ada', { members: ['ada'] });
		w.post('p1', 'pr', 'ada');
		w.comment('c1', 'p1', 'ada');
		w.comment('c2', 'p1', 'ada', 'c1');
		w.thread('t1', ['ada']);
		w.message('m1', 't1', 'ada');
		await deliver(w.env, { kind: 'post.created', postId: 'p1', projectId: 'pr', authorId: 'ada' });
		await deliver(w.env, {
			kind: 'comment.created',
			commentId: 'c2',
			subjectId: 'p1',
			authorId: 'ada'
		});
		await deliver(w.env, {
			kind: 'mention',
			subjectType: 'post',
			subjectId: 'p1',
			mentionedUserId: 'ada',
			authorId: 'ada'
		});
		await deliver(w.env, {
			kind: 'note.shared',
			noteId: 'n1',
			sharedWith: ['ada'],
			authorId: 'ada'
		});
		await deliver(w.env, {
			kind: 'message.created',
			messageId: 'm1',
			threadId: 't1',
			authorId: 'ada',
			recipientIds: ['ada']
		});
		expect(w.notificationsFor('ada')).toEqual([]);
	});

	it('does not notify someone who can’t see the project the item is in', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('guest', 'guest');
		w.person('outsider');
		// A private project the outsider isn't in, and a public one the guest isn't in.
		w.project('secret', 'ada', { members: ['ada'], favorites: ['outsider'] });
		w.sqlite.exec("UPDATE projects SET private = 1 WHERE id = 'secret'");
		w.project('open', 'ada', { favorites: ['guest'] });
		w.post('p1', 'secret', 'ada');
		w.post('p2', 'open', 'ada');
		await deliver(w.env, {
			kind: 'post.created',
			postId: 'p1',
			projectId: 'secret',
			authorId: 'ada'
		});
		await deliver(w.env, {
			kind: 'post.created',
			postId: 'p2',
			projectId: 'open',
			authorId: 'ada'
		});
		await deliver(w.env, {
			kind: 'mention',
			subjectType: 'post',
			subjectId: 'p1',
			mentionedUserId: 'outsider',
			authorId: 'ada'
		});
		expect(w.notificationsFor('outsider')).toEqual([]);
		expect(w.notificationsFor('guest')).toEqual([]);
	});

	it('does not notify a deactivated member', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('gone', 'member', { deactivated: true });
		w.note('n1', 'ada');
		await deliver(w.env, {
			kind: 'note.shared',
			noteId: 'n1',
			sharedWith: ['gone'],
			authorId: 'ada'
		});
		expect(w.notificationsFor('gone')).toEqual([]);
	});

	it('notifies once when the same event is delivered twice', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		w.note('n1', 'ada');
		const event: DomainEvent = {
			kind: 'note.shared',
			noteId: 'n1',
			sharedWith: ['bo'],
			authorId: 'ada'
		};
		await deliver(w.env, event);
		await deliver(w.env, event);
		expect(w.notificationsFor('bo')).toHaveLength(1);
	});

	it('publishes the new unread count to the recipient’s user topic', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		w.note('n1', 'ada');
		w.note('n2', 'ada');
		await deliver(w.env, {
			kind: 'note.shared',
			noteId: 'n1',
			sharedWith: ['bo'],
			authorId: 'ada'
		});
		await deliver(w.env, {
			kind: 'note.shared',
			noteId: 'n2',
			sharedWith: ['bo'],
			authorId: 'ada'
		});
		expect(w.published.filter((p) => p.payload.type === 'inbox.unread')).toEqual([
			{ topic: 'user:bo', payload: { type: 'inbox.unread', count: 1 } },
			{ topic: 'user:bo', payload: { type: 'inbox.unread', count: 2 } }
		]);
	});

	it('acks and logs as unhandled the kinds that notify nobody', async () => {
		const w = notificationWorld();
		const events: DomainEvent[] = [
			{ kind: 'post.updated', postId: 'p1', projectId: 'pr', authorId: 'ada' },
			{ kind: 'member.invited', inviteId: 'i1', email: 'x@example.com', invitedBy: 'ada' },
			{ kind: 'call.started', callId: 'c1', roomId: 'r1', startedBy: 'ada' }
		];
		for (const event of events) await deliver(w.env, event);
		const statuses = w.sqlite.prepare('SELECT kind, status FROM job_log ORDER BY kind').all();
		expect(statuses).toEqual(
			events
				.map((e) => ({ kind: e.kind, status: 'unhandled' }))
				.sort((a, b) => a.kind.localeCompare(b.kind))
		);
	});

	it('fails the job, naming it, when the project an event names isn’t there', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		const events: DomainEvent[] = [
			{ kind: 'project.member_added', projectId: 'p-gone', userId: 'bo', addedBy: 'ada' },
			{ kind: 'project.renamed', projectId: 'p-gone', renamedBy: 'ada' }
		];
		for (const event of events) {
			const message = {
				body: { ...event, emittedAt: 1 } as JobMessage,
				ack: vi.fn(),
				retry: vi.fn()
			};
			await consumeJobs({ messages: [message] } as unknown as MessageBatch<JobMessage>, w.env);
			expect(message.retry).toHaveBeenCalled();
		}
		expect(w.sqlite.prepare('SELECT kind, status, error FROM job_log').all()).toEqual([
			{
				kind: 'project.member_added',
				status: 'failed',
				error: 'notifications: project p-gone not found'
			},
			{
				kind: 'project.renamed',
				status: 'failed',
				error: 'notifications: project p-gone not found'
			}
		]);
	});
});

describe('web push from the consumer', () => {
	// A browser's push keys, generated the way a browser would.
	async function browserKeys() {
		const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
			'deriveBits'
		])) as CryptoKeyPair;
		const raw = new Uint8Array(
			(await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer
		);
		const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
		return { p256dh: b64(raw), auth: b64(crypto.getRandomValues(new Uint8Array(16))) };
	}

	const vapid = {
		VAPID_PUBLIC_KEY:
			'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
		VAPID_PRIVATE_KEY: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'
	};

	it('pushes an encrypted, VAPID-signed message to each of the recipient’s devices', async () => {
		const w = notificationWorld(vapid);
		w.person('ada');
		w.person('bo');
		w.note('n1', 'ada');
		const keys = await browserKeys();
		w.sqlite
			.prepare('INSERT INTO push_subscriptions VALUES (?, ?, ?, ?, ?, 0)')
			.run('s1', 'bo', 'https://push.example.net/sub/1', keys.p256dh, keys.auth);
		const fetch = vi.fn(async () => new Response(null, { status: 201 }));
		vi.stubGlobal('fetch', fetch);
		await deliver(w.env, {
			kind: 'note.shared',
			noteId: 'n1',
			sharedWith: ['bo'],
			authorId: 'ada'
		});
		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://push.example.net/sub/1');
		const headers = init.headers as Record<string, string>;
		expect(headers['content-encoding']).toBe('aes128gcm');
		expect(headers.authorization).toMatch(/^vapid t=.+, k=BP4z9/);
		// The body starts with the 16-byte salt, the record size 4096 and a 65-byte key.
		const body = init.body as Uint8Array;
		expect([...body.slice(16, 21)]).toEqual([0, 0, 16, 0, 65]);
	});

	it('does not push a kind the recipient turned push off for', async () => {
		const w = notificationWorld(vapid);
		w.person('ada');
		w.person('bo');
		w.note('n1', 'ada');
		const keys = await browserKeys();
		w.sqlite
			.prepare('INSERT INTO push_subscriptions VALUES (?, ?, ?, ?, ?, 0)')
			.run('s1', 'bo', 'https://push.example.net/sub/1', keys.p256dh, keys.auth);
		w.sqlite
			.prepare(
				"INSERT INTO notification_settings VALUES ('bo', '[]', '[\"mention\"]', 0, 9, 0, 5, 17, NULL, NULL)"
			)
			.run();
		const fetch = vi.fn(async () => new Response(null, { status: 201 }));
		vi.stubGlobal('fetch', fetch);
		await deliver(w.env, {
			kind: 'note.shared',
			noteId: 'n1',
			sharedWith: ['bo'],
			authorId: 'ada'
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it('still pushes to everyone else when one push service fails, then fails the job loudly', async () => {
		const w = notificationWorld(vapid);
		w.person('ada');
		w.person('bo');
		w.person('cy');
		w.note('n1', 'ada');
		const keys = await browserKeys();
		const insert = w.sqlite.prepare('INSERT INTO push_subscriptions VALUES (?, ?, ?, ?, ?, 0)');
		insert.run('broken', 'bo', 'https://push.example.net/sub/broken', keys.p256dh, keys.auth);
		insert.run('fine', 'cy', 'https://push.example.net/sub/fine', keys.p256dh, keys.auth);
		const fetch = vi.fn(
			async (url: string) => new Response('down', { status: url.endsWith('broken') ? 500 : 201 })
		);
		vi.stubGlobal('fetch', fetch);
		const message = {
			body: {
				kind: 'note.shared',
				noteId: 'n1',
				sharedWith: ['bo', 'cy'],
				authorId: 'ada',
				emittedAt: 1
			} as JobMessage,
			ack: vi.fn(),
			retry: vi.fn()
		};
		await consumeJobs({ messages: [message] } as unknown as MessageBatch<JobMessage>, w.env);
		expect(fetch.mock.calls.map(([url]) => url)).toContain('https://push.example.net/sub/fine');
		expect(
			w.published.filter((p) => p.payload.type === 'inbox.unread').map((p) => p.topic)
		).toEqual(['user:bo', 'user:cy']);
		const log = w.sqlite.prepare('SELECT status, error FROM job_log').all() as { error: string }[];
		expect(log).toEqual([expect.objectContaining({ status: 'failed' })]);
		expect(log[0].error).toContain('expected 2xx, got 500');
	});

	it('deletes a subscription the push service says is gone (404 or 410)', async () => {
		const w = notificationWorld(vapid);
		w.person('ada');
		w.person('bo');
		w.note('n1', 'ada');
		const keys = await browserKeys();
		const insert = w.sqlite.prepare('INSERT INTO push_subscriptions VALUES (?, ?, ?, ?, ?, 0)');
		insert.run('gone', 'bo', 'https://push.example.net/sub/gone', keys.p256dh, keys.auth);
		insert.run('expired', 'bo', 'https://push.example.net/sub/expired', keys.p256dh, keys.auth);
		insert.run('live', 'bo', 'https://push.example.net/sub/live', keys.p256dh, keys.auth);
		const status = { gone: 410, expired: 404, live: 201 };
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async (url: string) =>
					new Response(null, { status: status[url.split('/').pop() as keyof typeof status] })
			)
		);
		await deliver(w.env, {
			kind: 'note.shared',
			noteId: 'n1',
			sharedWith: ['bo'],
			authorId: 'ada'
		});
		expect(w.sqlite.prepare('SELECT id FROM push_subscriptions').all()).toEqual([{ id: 'live' }]);
	});
});
