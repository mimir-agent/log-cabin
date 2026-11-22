import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DomainEvent, JobMessage } from '../events';
import { consumeJobs, runCron } from '../jobs';
import { pushTo } from './notify';
import { pauseNotifications, saveSchedule } from './quiet';
import { notificationWorld } from './testing/world';
import type { SignedIn } from '../auth/session';
import { heldNotifications, notifyAnyway } from '../chat/anyway';
import { loadThread } from '../chat/threads';
import { status } from '../testing/chat-world';

const minute = 60 * 1000;
const hour = 60 * minute;
// Tuesday 17 November 2026, 20:00 in Los Angeles (Wednesday 04:00 UTC).
const tuesdayEvening = Date.UTC(2026, 10, 18, 4, 0);
const wednesdayMorning = tuesdayEvening + 12.5 * hour; // 08:30 in Los Angeles

const vapid = {
	VAPID_PUBLIC_KEY:
		'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
	VAPID_PRIVATE_KEY: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'
};

async function browserKeys() {
	const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveBits'
	])) as CryptoKeyPair;
	const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
	const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
	return { p256dh: b64(raw), auth: b64(crypto.getRandomValues(new Uint8Array(16))) };
}

/** A project Ada and Bo are in; Bo, in Los Angeles, has push on one device. */
async function quietWorld() {
	const w = notificationWorld(vapid);
	w.person('ada');
	w.person('bo', 'member', { timezone: 'America/Los_Angeles' });
	w.project('pr', 'ada', { members: ['ada', 'bo'] });
	const keys = await browserKeys();
	w.sqlite
		.prepare('INSERT INTO push_subscriptions VALUES (?, ?, ?, ?, ?, 0)')
		.run('s1', 'bo', 'https://push.example.net/sub/1', keys.p256dh, keys.auth);
	const pushes = vi.fn(async () => new Response(null, { status: 201 }));
	vi.stubGlobal('fetch', pushes);

	let posts = 0;
	const at = (time: number) => vi.setSystemTime(time);
	/** Ada mentions Bo in a new post, through the JOBS consumer. */
	const mentionBo = async () => {
		const postId = `p${++posts}`;
		w.post(postId, 'pr', 'ada');
		const event: DomainEvent = {
			kind: 'mention',
			subjectType: 'post',
			subjectId: postId,
			mentionedUserId: 'bo',
			authorId: 'ada'
		};
		const message = { body: { ...event, emittedAt: Date.now() }, ack: vi.fn(), retry: vi.fn() };
		await consumeJobs({ messages: [message] } as unknown as MessageBatch<JobMessage>, w.env);
		expect(message.retry, 'the job failed; see job_log').not.toHaveBeenCalled();
	};
	const emailCron = () =>
		runCron({ cron: '*/5 * * * *', scheduledTime: Date.now() } as ScheduledController, w.env);
	const inbox = () =>
		w.sqlite.prepare("SELECT kind FROM notifications WHERE user_id = 'bo'").all().length;
	const mail = () =>
		w.sqlite.prepare("SELECT subject FROM dev_mail WHERE to_address LIKE 'bo@%'").all();
	return { ...w, pushes, at, mentionBo, emailCron, inbox, mail };
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('quiet hours', () => {
	it('outside the schedule’s hours, a mention reaches the inbox with no push and no email, then or later', async () => {
		const w = await quietWorld();
		await saveSchedule(w.env, 'bo', {
			weekdays: [1, 2, 3, 4, 5],
			startMinute: 8 * 60,
			endMinute: 18 * 60
		});

		w.at(tuesdayEvening);
		await w.mentionBo();
		expect(w.inbox()).toBe(1);
		expect(w.pushes).not.toHaveBeenCalled();
		w.at(tuesdayEvening + 15 * minute);
		await w.emailCron();
		expect(w.mail()).toEqual([]);

		// The window opens: what arrived overnight isn't sent in a burst.
		w.at(wednesdayMorning);
		await w.emailCron();
		w.at(wednesdayMorning + 15 * minute);
		await w.emailCron();
		expect(w.mail()).toEqual([]);
	});

	it('inside the schedule’s hours, a mention is pushed, and emailed once it’s been unread a while', async () => {
		const w = await quietWorld();
		await saveSchedule(w.env, 'bo', {
			weekdays: [1, 2, 3, 4, 5],
			startMinute: 8 * 60,
			endMinute: 18 * 60
		});
		w.at(wednesdayMorning);
		await w.mentionBo();
		expect(w.pushes).toHaveBeenCalledTimes(1);
		w.at(wednesdayMorning + 15 * minute);
		await w.emailCron();
		expect(w.mail()).toEqual([{ subject: 'You have 1 unread notification' }]);
	});

	it('holds a day the schedule leaves out from start to end', async () => {
		const w = await quietWorld();
		await saveSchedule(w.env, 'bo', { weekdays: [1, 2], startMinute: 8 * 60, endMinute: 18 * 60 });
		w.at(wednesdayMorning);
		await w.mentionBo();
		expect(w.inbox()).toBe(1);
		expect(w.pushes).not.toHaveBeenCalled();
	});

	it('holds a mention made just before the window closes, if its email falls due after', async () => {
		const w = await quietWorld();
		await saveSchedule(w.env, 'bo', {
			weekdays: [1, 2, 3, 4, 5],
			startMinute: 8 * 60,
			endMinute: 18 * 60
		});
		const tuesdayLastMinutes = tuesdayEvening - 2 * hour - 5 * minute; // 17:55
		w.at(tuesdayLastMinutes);
		await w.mentionBo();
		expect(w.pushes).toHaveBeenCalledTimes(1);
		w.at(tuesdayLastMinutes + 15 * minute);
		await w.emailCron();
		w.at(wednesdayMorning + 15 * minute);
		await w.emailCron();
		expect(w.mail()).toEqual([]);
	});
});

describe('pause notifications', () => {
	it('until a time: a mention reaches the inbox, isn’t pushed or emailed, and isn’t sent when the pause ends', async () => {
		const w = await quietWorld();
		w.at(wednesdayMorning);
		await pauseNotifications(w.env, 'bo', wednesdayMorning + hour);
		await w.mentionBo();
		expect(w.inbox()).toBe(1);
		expect(w.pushes).not.toHaveBeenCalled();
		w.at(wednesdayMorning + 15 * minute);
		await w.emailCron();
		w.at(wednesdayMorning + 2 * hour);
		await w.emailCron();
		expect(w.mail()).toEqual([]);

		await w.mentionBo();
		expect(w.pushes, 'the pause is over').toHaveBeenCalledTimes(1);
	});

	it('resumed early, pushes again at once', async () => {
		const w = await quietWorld();
		w.at(wednesdayMorning);
		await pauseNotifications(w.env, 'bo', wednesdayMorning + hour);
		await pauseNotifications(w.env, 'bo', null);
		await w.mentionBo();
		expect(w.pushes).toHaveBeenCalledTimes(1);
	});

	it('also holds a call’s ringing push and a reminder’s', async () => {
		const w = await quietWorld();
		w.at(wednesdayMorning);
		await pauseNotifications(w.env, 'bo', wednesdayMorning + hour);
		const ring = await pushTo(w.env, 'bo', 'call', {
			title: 'ada is calling',
			body: null,
			url: '/calls/c1',
			unread: 0
		});
		expect(ring.sent).toBe(0);
		w.post('p1', 'pr', 'ada');
		w.sqlite
			.prepare(
				"INSERT INTO follow_ups VALUES ('fu1', 'bo', 'post', 'p1', 'T', '/posts/p1', ?, NULL, 0, 0)"
			)
			.run(wednesdayMorning - minute);
		await w.emailCron();
		expect(w.inbox(), 'the reminder is in the inbox').toBe(1);
		expect(w.pushes).not.toHaveBeenCalled();
	});
});

describe('a reminder in quiet hours', () => {
	/** Bo has a reminder due on Ada's post at 08:30 on Wednesday, in a pause that ends at 09:30. */
	async function dueReminder(notifyAnywayValue: 0 | 1) {
		const w = await quietWorld();
		w.at(wednesdayMorning);
		await pauseNotifications(w.env, 'bo', wednesdayMorning + hour);
		w.post('p1', 'pr', 'ada');
		w.sqlite
			.prepare(
				"INSERT INTO follow_ups VALUES ('fu1', 'bo', 'post', 'p1', 'T', '/posts/p1', ?, NULL, 0, ?)"
			)
			.run(wednesdayMorning - minute, notifyAnywayValue);
		await w.emailCron();
		return w;
	}
	const heldAt = (w: Awaited<ReturnType<typeof quietWorld>>) =>
		(
			w.sqlite
				.prepare("SELECT held_at FROM notifications WHERE user_id = 'bo' ORDER BY created_at")
				.all() as {
				held_at: number | null;
			}[]
		).map((row) => row.held_at);

	it('is pushed through a pause by default, as something its owner asked for at that time', async () => {
		const w = await dueReminder(1);
		expect(w.inbox()).toBe(1);
		expect(w.pushes).toHaveBeenCalledTimes(1);
		expect(heldAt(w), 'it was not held').toEqual([null]);
	});

	it('is held when its owner turned that off for it, and the inbox row says so', async () => {
		const w = await dueReminder(0);
		expect(w.pushes).not.toHaveBeenCalled();
		expect(heldAt(w)).toEqual([wednesdayMorning]);
	});

	it('is pushed through the schedule too, which is what held a reminder due on a Friday night', async () => {
		const w = await quietWorld();
		await saveSchedule(w.env, 'bo', {
			weekdays: [1, 2, 3, 4, 5],
			startMinute: 8 * 60,
			endMinute: 18 * 60
		});
		w.at(tuesdayEvening);
		w.post('p1', 'pr', 'ada');
		w.sqlite
			.prepare(
				"INSERT INTO follow_ups VALUES ('fu1', 'bo', 'post', 'p1', 'T', '/posts/p1', ?, NULL, 0, 1)"
			)
			.run(tuesdayEvening - minute);
		await w.emailCron();
		expect(w.pushes).toHaveBeenCalledTimes(1);
	});

	it('leaves a mention made in quiet hours held, and one made outside them not', async () => {
		const w = await quietWorld();
		w.at(wednesdayMorning);
		await pauseNotifications(w.env, 'bo', wednesdayMorning + hour);
		await w.mentionBo();
		w.at(wednesdayMorning + 2 * hour);
		await w.mentionBo();
		expect(heldAt(w)).toEqual([wednesdayMorning, null]);
	});
});

describe('notify anyway', () => {
	const signedIn = (id: string) =>
		({
			user: { id, name: id, username: `u-${id}`, email: `${id}@example.com`, avatarUrl: null },
			member: { id: `m-${id}`, role: 'member' }
		}) as unknown as SignedIn;

	it('pushes the latest message of a DM to someone paused, once, and only for its sender', async () => {
		const w = await quietWorld();
		w.at(wednesdayMorning);
		await pauseNotifications(w.env, 'bo', wednesdayMorning + hour);
		w.thread('dm', ['ada', 'bo']);
		w.message('m1', 'dm', 'ada');
		const [ada, bo] = [signedIn('ada'), signedIn('bo')];
		const dm = async (who: SignedIn) => loadThread(w.env, who, 'dm');

		expect(await heldNotifications(w.env, bo, await dm(bo))).toBeNull();
		expect(await heldNotifications(w.env, ada, await dm(ada))).toEqual({
			name: 'bo',
			canNotify: true
		});
		await notifyAnyway(w.env, ada, await dm(ada));
		expect(w.pushes, 'pushed through the pause').toHaveBeenCalledTimes(1);
		expect(await heldNotifications(w.env, ada, await dm(ada))).toEqual({
			name: 'bo',
			canNotify: false
		});
		expect(await status(notifyAnyway(w.env, ada, await dm(ada)))).toBe(403);

		w.message('m2', 'dm', 'ada');
		w.sqlite
			.prepare("UPDATE messages SET created_at = ? WHERE id = 'm2'")
			.run(wednesdayMorning + 1);
		w.at(wednesdayMorning + 2);
		expect(await heldNotifications(w.env, ada, await dm(ada))).toEqual({
			name: 'bo',
			canNotify: true
		});
	});

	it('offers nothing in a group, or once the pause is over', async () => {
		const w = await quietWorld();
		w.at(wednesdayMorning);
		await pauseNotifications(w.env, 'bo', wednesdayMorning + hour);
		w.thread('group', ['ada', 'bo'], 'Crew');
		w.message('m1', 'group', 'ada');
		w.thread('dm', ['ada', 'bo']);
		w.message('m2', 'dm', 'ada');
		const ada = signedIn('ada');

		expect(await heldNotifications(w.env, ada, await loadThread(w.env, ada, 'group'))).toBeNull();
		expect(await status(notifyAnyway(w.env, ada, await loadThread(w.env, ada, 'group')))).toBe(403);
		w.at(wednesdayMorning + 2 * hour);
		expect(await heldNotifications(w.env, ada, await loadThread(w.env, ada, 'dm'))).toBeNull();
	});
});
