import { isHttpError } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import { runCron } from '#lib/server/jobs/index.js';
import { listInbox } from '#lib/server/notifications/inbox.js';
import { pauseNotifications } from '#lib/server/notifications/quiet.js';
import { createNote } from '#lib/server/notes/notes.js';
import { createComment } from '#lib/server/posts/comments.js';
import { loadPost, parseBody, type BodyInput } from '#lib/server/posts/posts.js';
import { postWorld, routeEvent, textDoc } from '#lib/server/testing/post-world.js';
import { actions, load } from './+page.server';
import { actions as inboxActions } from '../inbox/+page.server';

type FollowUpEvent = Parameters<typeof actions.set>[0];
type InboxEvent = Parameters<typeof inboxActions.finishReminder>[0];

const minute = 60 * 1000;
const start = new Date('2026-11-18T10:00:00Z').getTime();

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(start);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

// A browser's push keys, generated the way a browser would.
async function browserKeys() {
	const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveBits'
	])) as CryptoKeyPair;
	const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
	const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
	return { p256dh: b64(raw), auth: b64(crypto.getRandomValues(new Uint8Array(16))) };
}

const vapid = {
	VAPID_PUBLIC_KEY:
		'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
	VAPID_PRIVATE_KEY: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'
};

const followUpEvent = (who: SignedIn, fields: Record<string, string>) =>
	routeEvent(who, '/follow-ups', {}, fields) as unknown as FollowUpEvent;

const inboxEvent = (who: SignedIn, fields: Record<string, string>) =>
	routeEvent(who, '/inbox', {}, fields) as unknown as InboxEvent;

/** The five-minute cron, run as the scheduler would at this moment of the fake clock. */
async function cronAt(env: Env, at: number) {
	vi.setSystemTime(at);
	await runCron({ cron: '*/5 * * * *', scheduledTime: at } as ScheduledController, env);
}

async function remindMe(who: SignedIn, subjectType: string, subjectId: string, showAt: number) {
	await actions.set(followUpEvent(who, { subjectType, subjectId, showAt: String(showAt) }));
}

describe('reminders', () => {
	it('puts a reminder on a post in the inbox once the cron runs after it’s due', async () => {
		const { env, author, postId } = await postWorld();
		await remindMe(author, 'post', postId, start + 60 * minute);

		await cronAt(env, start + 55 * minute);
		expect(await listInbox(env, author, 'unread'), 'not due yet').toEqual([]);

		await cronAt(env, start + 60 * minute);
		expect(await listInbox(env, author, 'unread')).toMatchObject([
			{ kind: 'follow_up', title: 'Plan', url: `/posts/${postId}` }
		]);
		await cronAt(env, start + 65 * minute);
		expect(await listInbox(env, author, 'unread'), 'shown once').toHaveLength(1);
	});

	it('reminds about a comment, a note and a call, each linking to it', async () => {
		const { env, sqlite, author, postId, projectId } = await postWorld();
		const post = await loadPost(env, author, postId);
		await createComment(env, author, post, parseBody(textDoc('Re')) as BodyInput, null);
		const { id: commentId } = sqlite.prepare('SELECT id FROM comments').get() as { id: string };
		const noteId = await createNote(env, author, {
			title: 'Agenda',
			...(parseBody(textDoc('Items')) as BodyInput)
		});
		sqlite
			.prepare(
				'INSERT INTO calls (id, project_id, started_by, started_at, ended_at) VALUES (?, ?, ?, 0, 1)'
			)
			.run('call1', projectId, author.user.id);

		await remindMe(author, 'comment', commentId, start + minute);
		await remindMe(author, 'note', noteId, start + 2 * minute);
		await remindMe(author, 'call', 'call1', start + 3 * minute);
		await cronAt(env, start + 5 * minute);

		const inbox = await listInbox(env, author, 'unread');
		const links = inbox.map(({ title, url }) => ({ title, url }));
		expect(links.sort((a, b) => a.url.localeCompare(b.url))).toEqual([
			{ title: 'Call in Launch', url: '/calls/call1' },
			{ title: 'Agenda', url: `/notes/${noteId}` },
			{ title: 'Plan', url: `/posts/${postId}#comment-${commentId}` }
		]);
	});

	it('snoozes a due reminder out of the inbox until its new time', async () => {
		const { env, author, postId } = await postWorld();
		await remindMe(author, 'post', postId, start + 5 * minute);
		await cronAt(env, start + 5 * minute);
		const [item] = await listInbox(env, author, 'unread');

		const later = start + 3 * 60 * minute;
		await inboxActions.snoozeReminder(
			inboxEvent(author, { item: item.itemKey, showAt: String(later) })
		);
		expect(await listInbox(env, author, 'unread')).toEqual([]);
		const { reminders } = (await load(followUpEvent(author, {}) as never)) as {
			reminders: { showAt: number }[];
		};
		expect(
			reminders.map((r) => r.showAt),
			'listed under upcoming reminders'
		).toEqual([later]);

		await cronAt(env, later);
		expect(await listInbox(env, author, 'unread')).toMatchObject([{ kind: 'follow_up' }]);
	});

	it('marks a due reminder done: out of the inbox, and never shown again', async () => {
		const { env, author, postId } = await postWorld();
		await remindMe(author, 'post', postId, start + 5 * minute);
		await cronAt(env, start + 5 * minute);
		const [item] = await listInbox(env, author, 'unread');

		await inboxActions.finishReminder(inboxEvent(author, { item: item.itemKey }));
		expect(await listInbox(env, author, 'unread')).toEqual([]);
		await cronAt(env, start + 60 * minute);
		expect(await listInbox(env, author, 'unread')).toEqual([]);
	});

	it('refuses a reminder on a post its setter can’t see', async () => {
		const { env, person, postId } = await postWorld();
		const guest = await person('Gus', 'guest');
		const e = await remindMe(guest, 'post', postId, start + minute).catch((e: unknown) => e);
		expect(isHttpError(e, 404), `expected 404, got ${String(e)}`).toBe(true);
		await cronAt(env, start + 5 * minute);
		expect(await listInbox(env, guest, 'unread')).toEqual([]);
	});

	it('shows nothing to someone who lost access to the post before it was due', async () => {
		const { env, sqlite, person, projectId, postId } = await postWorld();
		const guest = await person('Gus', 'guest');
		const leaver = await person('Lee');
		sqlite
			.prepare('INSERT INTO project_members (project_id, user_id, created_at) VALUES (?, ?, 0)')
			.run(projectId, guest.user.id);
		await remindMe(guest, 'post', postId, start + 5 * minute);
		await remindMe(leaver, 'post', postId, start + 5 * minute);

		sqlite.prepare('DELETE FROM project_members WHERE user_id = ?').run(guest.user.id);
		sqlite.prepare('UPDATE members SET deactivated_at = 1 WHERE user_id = ?').run(leaver.user.id);
		await cronAt(env, start + 5 * minute);
		expect(await listInbox(env, guest, 'unread'), 'guest taken off the project').toEqual([]);
		expect(await listInbox(env, leaver, 'unread'), 'deactivated member').toEqual([]);
	});

	it('refuses a time in the past', async () => {
		const { author, postId } = await postWorld();
		const e = await remindMe(author, 'post', postId, start - minute).catch((e: unknown) => e);
		expect(isHttpError(e, 400), `expected 400, got ${String(e)}`).toBe(true);
	});

	it('refuses a reminder on something that can’t have one, and says what it was', async () => {
		const { author, postId } = await postWorld();
		const e = await remindMe(author, 'poll', postId, start + minute).catch((e: unknown) => e);
		expect(isHttpError(e, 400), `expected 400, got ${String(e)}`).toBe(true);
		expect((e as { body: { message: string } }).body.message).toContain('“poll”');
	});

	it('won’t let someone else finish or snooze your reminder', async () => {
		const { env, author, person, postId } = await postWorld();
		const bo = await person('Bo');
		await remindMe(author, 'post', postId, start + 5 * minute);
		await cronAt(env, start + 5 * minute);
		const [item] = await listInbox(env, author, 'unread');
		const e = await Promise.resolve(
			inboxActions.finishReminder(inboxEvent(bo, { item: item.itemKey }))
		).catch((e: unknown) => e);
		expect(isHttpError(e, 404), `expected 404, got ${String(e)}`).toBe(true);
		expect(await listInbox(env, author, 'unread')).toHaveLength(1);
	});

	it('pushes a due reminder to the devices of someone with push on', async () => {
		const { env, sqlite, author, postId } = await postWorld();
		Object.assign(env, vapid);
		const keys = await browserKeys();
		sqlite
			.prepare('INSERT INTO push_subscriptions VALUES (?, ?, ?, ?, ?, 0)')
			.run('s1', author.user.id, 'https://push.example.net/sub/1', keys.p256dh, keys.auth);
		const fetch = vi.fn(async () => new Response(null, { status: 201 }));
		vi.stubGlobal('fetch', fetch);
		await remindMe(author, 'post', postId, start + 5 * minute);
		await cronAt(env, start + 5 * minute);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe('https://push.example.net/sub/1');
	});

	it('goes away with its post', async () => {
		const { env, sqlite, author, postId } = await postWorld();
		await remindMe(author, 'post', postId, start + 5 * minute);
		sqlite.prepare('DELETE FROM posts WHERE id = ?').run(postId);
		await cronAt(env, start + 5 * minute);
		expect(await listInbox(env, author, 'unread')).toEqual([]);
	});
});

describe('a reminder when the person has paused notifications', () => {
	async function dueWhilePaused(notifyAnyway: Record<string, string>) {
		const { env, author, postId } = await postWorld();
		await pauseNotifications(env, author.user.id, start + 24 * 60 * minute);
		await actions.set(
			followUpEvent(author, {
				subjectType: 'post',
				subjectId: postId,
				showAt: String(start + 60 * minute),
				...notifyAnyway
			})
		);
		await cronAt(env, start + 60 * minute);
		return listInbox(env, author, 'unread');
	}

	it('is held, and the inbox row says so, when the form’s box is unchecked', async () => {
		expect(await dueWhilePaused({})).toMatchObject([{ kind: 'follow_up', held: true }]);
	});

	it('is not held when the box is checked, as it is by default', async () => {
		expect(await dueWhilePaused({ notifyAnyway: 'on' })).toMatchObject([
			{ kind: 'follow_up', held: false }
		]);
	});
});
