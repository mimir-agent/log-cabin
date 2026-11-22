import { describe, expect, it } from 'vitest';
import { notificationWorld } from '#lib/server/notifications/testing/world.js';
import { actions, load } from './+page.server';
import { DELETE, POST } from './push/+server';
import { DELETE as RESUME, POST as PAUSE } from './pause/+server';

function signedIn(userId: string, request: Request) {
	return {
		locals: {
			user: {
				id: userId,
				name: userId,
				username: userId,
				email: `${userId}@example.com`,
				avatarUrl: null,
				theme: 'system'
			},
			member: { id: `m-${userId}`, role: 'member' }
		},
		url: new URL(request.url),
		request
	} as never;
}

const page = 'https://campfire.test/settings/notifications';

function save(userId: string, form: Record<string, string>) {
	return actions.default(
		signedIn(userId, new Request(page, { method: 'POST', body: new URLSearchParams(form) }))
	);
}

type Loaded = {
	settings: Record<string, unknown>;
	timezone: string;
};

const digestFields = {
	dailyDigestHour: '9',
	weeklyDigestWeekday: '5',
	weeklyDigestHour: '17'
};

describe('/settings/notifications', () => {
	it('starts from the defaults: mentions and messages emailed, everything pushed, Campsite’s digests', async () => {
		const w = notificationWorld();
		w.person('bo');
		const data = (await load(signedIn('bo', new Request(page)))) as Loaded;
		expect(data.settings).toEqual({
			emailKinds: ['mention', 'message'],
			pushKinds: [
				'mention',
				'comment',
				'reply',
				'message',
				'post',
				'note',
				'call',
				'feedback',
				'follow_up',
				'join_request',
				'reaction',
				'added_to_project',
				'project_renamed',
				'project_archived',
				'post_moved',
				'comment_resolved',
				'post_resolved',
				'post_resolved_from_comment'
			],
			dailyDigest: true,
			dailyDigestHour: 9,
			weeklyDigest: true,
			weeklyDigestWeekday: 5,
			weeklyDigestHour: 17
		});
		expect(data.timezone).toBe('UTC');
	});

	it('saves per-kind email and push choices, the digests and the time zone', async () => {
		const w = notificationWorld();
		w.person('bo');
		await save('bo', {
			'email-comment': 'on',
			'push-mention': 'on',
			weeklyDigest: 'on',
			dailyDigestHour: '7',
			weeklyDigestWeekday: '1',
			weeklyDigestHour: '10',
			timezone: 'Europe/Berlin'
		});
		const data = (await load(signedIn('bo', new Request(page)))) as Loaded;
		expect(data.settings).toMatchObject({
			emailKinds: ['comment'],
			pushKinds: ['mention'],
			dailyDigest: false,
			dailyDigestHour: 7,
			weeklyDigest: true,
			weeklyDigestWeekday: 1,
			weeklyDigestHour: 10
		});
		expect(data.timezone).toBe('Europe/Berlin');
	});

	it('saves a person still on the default UTC time zone', async () => {
		const w = notificationWorld();
		w.person('bo');
		const result = await save('bo', { ...digestFields, timezone: 'UTC' });
		expect(result).toEqual({ saved: true });
		const data = (await load(signedIn('bo', new Request(page)))) as Loaded & {
			timeZones: string[];
		};
		expect(data.timeZones, 'the time zone list offers the default').toContain('UTC');
	});

	it('refuses a time zone that isn’t one, and a digest hour or day off the list', async () => {
		const w = notificationWorld();
		w.person('bo');
		expect(await save('bo', { ...digestFields, timezone: 'Mars/Olympus' })).toMatchObject({
			status: 400
		});
		expect(
			await save('bo', { ...digestFields, dailyDigestHour: '24', timezone: 'UTC' })
		).toMatchObject({ status: 400, data: { message: 'Choose an hour from the list.' } });
		expect(
			await save('bo', { ...digestFields, weeklyDigestWeekday: '7', timezone: 'UTC' })
		).toMatchObject({ status: 400, data: { message: 'Choose a day from the list.' } });
	});

	const base = { ...digestFields, timezone: 'UTC' };
	const withSchedule = (fields: [string, string][]) =>
		actions.default(
			signedIn(
				'bo',
				new Request(page, {
					method: 'POST',
					body: new URLSearchParams([...Object.entries(base), ...fields])
				})
			)
		);
	type WithSchedule = Loaded & {
		schedule: { weekdays: number[]; startMinute: number; endMinute: number } | null;
	};

	it('saves a notification schedule of days and hours, and drops it for “at all times”', async () => {
		const w = notificationWorld();
		w.person('bo');
		await withSchedule([
			['schedule', 'custom'],
			['weekday', '2'],
			['weekday', '1'],
			['startMinute', '510'],
			['endMinute', '1050']
		]);
		let data = (await load(signedIn('bo', new Request(page)))) as WithSchedule;
		expect(data.schedule).toEqual({ weekdays: [1, 2], startMinute: 510, endMinute: 1050 });

		await withSchedule([['schedule', 'always']]);
		data = (await load(signedIn('bo', new Request(page)))) as WithSchedule;
		expect(data.schedule).toBeNull();
	});

	it('refuses a schedule with no days, or one that ends before it starts', async () => {
		const w = notificationWorld();
		w.person('bo');
		const times = [
			['startMinute', '480'],
			['endMinute', '1080']
		] satisfies [string, string][];
		expect(await withSchedule([['schedule', 'custom'], ...times])).toMatchObject({
			status: 400,
			data: { scheduleError: 'Choose at least one day for your schedule.' }
		});
		expect(
			await withSchedule([
				['schedule', 'custom'],
				['weekday', '1'],
				['startMinute', '1080'],
				['endMinute', '480']
			])
		).toMatchObject({
			status: 400,
			data: { scheduleError: 'Choose a start time before the end time.' }
		});
	});
});

describe('/settings/notifications/pause', () => {
	const send = (handler: typeof PAUSE, userId: string, body: unknown) =>
		handler(
			signedIn(userId, new Request(`${page}/pause`, { method: 'POST', body: JSON.stringify(body) }))
		);
	const pausedUntil = async (userId: string) =>
		((await load(signedIn(userId, new Request(page)))) as { pausedUntil: number | null })
			.pausedUntil;

	it('pauses the signed-in person until a later time, and resumes them', async () => {
		const w = notificationWorld();
		w.person('bo');
		w.person('cy');
		const until = Date.now() + 60 * 60 * 1000;
		await send(PAUSE, 'bo', { until });
		expect(await pausedUntil('bo')).toBe(until);
		expect(await pausedUntil('cy'), 'only the person who asked').toBeNull();
		await send(RESUME, 'bo', {});
		expect(await pausedUntil('bo')).toBeNull();
	});

	it('refuses a time that has passed', async () => {
		const w = notificationWorld();
		w.person('bo');
		await expect(send(PAUSE, 'bo', { until: Date.now() - 1000 })).rejects.toMatchObject({
			status: 400
		});
		expect(await pausedUntil('bo')).toBeNull();
	});
});

describe('/settings/notifications/push', () => {
	const subscription = {
		endpoint: 'https://push.example.net/sub/1',
		keys: { p256dh: 'BCVxsr7N', auth: 'BTBZMqHH' }
	};
	const call = (handler: typeof POST, userId: string, body: unknown) =>
		handler(
			signedIn(userId, new Request(`${page}/push`, { method: 'POST', body: JSON.stringify(body) }))
		);
	const stored = (w: ReturnType<typeof notificationWorld>) =>
		w.sqlite.prepare('SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions').all();

	it('stores a browser’s subscription, and deletes it on unsubscribe', async () => {
		const w = notificationWorld();
		w.person('bo');
		await call(POST, 'bo', subscription);
		expect(stored(w)).toEqual([
			{ user_id: 'bo', endpoint: subscription.endpoint, p256dh: 'BCVxsr7N', auth: 'BTBZMqHH' }
		]);
		await call(DELETE, 'bo', subscription);
		expect(stored(w)).toEqual([]);
	});

	it('doesn’t let someone delete another person’s subscription', async () => {
		const w = notificationWorld();
		w.person('bo');
		w.person('cy');
		await call(POST, 'bo', subscription);
		await call(DELETE, 'cy', subscription);
		expect(stored(w)).toHaveLength(1);
	});

	it('answers 400 for a body that isn’t a push subscription', async () => {
		const w = notificationWorld();
		w.person('bo');
		await expect(call(POST, 'bo', { endpoint: 'http://insecure' })).rejects.toMatchObject({
			status: 400
		});
	});
});
