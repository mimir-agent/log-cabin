import { describe, expect, it } from 'vitest';
import { notificationWorld } from '#lib/server/notifications/testing/world.js';
import { timeZones, timezoneOf } from '#lib/server/people/time-zone.js';
import { canonicalZone } from '#lib/time-zone.js';
import { POST } from './+server';

function follow(userId: string, body: { from: string; to: string }) {
	const request = new Request('https://campfire.test/settings/time-zone', {
		method: 'POST',
		body: JSON.stringify(body)
	});
	return POST({
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
	} as never);
}

describe('/settings/time-zone', () => {
	it('saves a Pacific browser’s zone for a member who never set one', async () => {
		const w = notificationWorld();
		w.person('cy');
		expect(await timezoneOf(w.env, 'cy')).toBe('UTC');
		expect((await follow('cy', { from: 'UTC', to: 'America/Los_Angeles' })).status).toBe(204);
		expect(await timezoneOf(w.env, 'cy')).toBe('America/Los_Angeles');
	});

	it('moves a member who follows their browser, and keeps one who chose a zone', async () => {
		const w = notificationWorld();
		w.person('cy');
		w.person('ben');
		await follow('cy', { from: 'UTC', to: 'America/Los_Angeles' });
		await follow('ben', { from: 'UTC', to: 'Asia/Tokyo' });

		await follow('cy', { from: 'America/Los_Angeles', to: 'America/New_York' });
		await follow('ben', { from: 'America/Los_Angeles', to: 'America/New_York' });

		expect(await timezoneOf(w.env, 'cy')).toBe('America/New_York');
		expect(await timezoneOf(w.env, 'ben')).toBe('Asia/Tokyo');
	});

	it('saves a zone the list names differently under the list’s name', async () => {
		const w = notificationWorld();
		w.person('cy');
		w.person('dee');
		expect((await follow('cy', { from: 'UTC', to: 'Asia/Kolkata' })).status).toBe(204);
		expect((await follow('dee', { from: 'UTC', to: 'America/Indiana/Indianapolis' })).status).toBe(
			204
		);

		expect(timeZones).toContain(await timezoneOf(w.env, 'cy'));
		expect(canonicalZone(await timezoneOf(w.env, 'cy'))).toBe(canonicalZone('Asia/Kolkata'));
		expect(timeZones).toContain(await timezoneOf(w.env, 'dee'));

		// Their browser still says Asia/Kolkata, and a trip still moves them.
		await follow('cy', { from: 'Asia/Kolkata', to: 'Asia/Tokyo' });
		expect(await timezoneOf(w.env, 'cy')).toBe('Asia/Tokyo');
	});

	it('refuses a zone that isn’t on the settings list', async () => {
		const w = notificationWorld();
		w.person('cy');
		await expect(follow('cy', { from: 'UTC', to: 'Mars/Olympus' })).rejects.toMatchObject({
			status: 400
		});
		expect(await timezoneOf(w.env, 'cy')).toBe('UTC');
	});
});
