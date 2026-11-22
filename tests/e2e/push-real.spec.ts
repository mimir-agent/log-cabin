// Push, end to end and for real: the installed app asks to turn push on, the browser subscribes
// through its own push service, the server signs and sends a due reminder to that service, and
// the browser shows it. Needs the full Chromium (the headless shell has no push service) in a
// real profile (Chrome has no Push API in incognito, which is what a Playwright context is), and
// a network that reaches the push service.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { baseURL, people, post } from './fixtures.ts';
import { d1 } from './database.ts';

test('a reminder due while the owner is outside their schedule reaches the browser as a notification', async () => {
	const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'push-')), {
		channel: 'chromium',
		baseURL,
		viewport: { width: 390, height: 800 },
		permissions: ['notifications']
	});
	await context.addCookies([{ name: 'campfire_session', value: people.eve.token, url: baseURL }]);
	// The installed app, as Safari on iOS reports it: the prompt shows only there.
	await context.addInitScript(() =>
		Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
	);
	const page = await context.newPage();
	await page.goto('/', { waitUntil: 'networkidle' });
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

	await page.getByRole('button', { name: 'Turn on notifications' }).click();
	await expect(page.getByRole('button', { name: 'Turn on notifications' })).toHaveCount(0);
	const endpoint = await page.evaluate(async () => {
		const registration = await navigator.serviceWorker.ready;
		return (await registration.pushManager.getSubscription())?.endpoint;
	});
	expect(endpoint, 'the browser subscribed through its push service').toMatch(/^https:\/\//);

	// Eve is quiet at all hours: a schedule that allows no day. A reminder breaks through it.
	const now = Date.now();
	const sql = `
		INSERT INTO notification_schedules (user_id, weekdays, start_minute, end_minute) VALUES ('${people.eve.id}', '[]', 480, 1080);
		INSERT INTO follow_ups (id, user_id, subject_type, subject_id, title, url, show_at, created_at)
			VALUES ('01E2EPUSH00000000000000001', '${people.eve.id}', 'post', '${post.id}', '${post.title}', '/posts/${post.id}', ${now - 1000}, ${now - 2000});`;
	d1(sql);
	const cron = await page.request.get('/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*');
	expect(cron.status()).toBe(200);

	await expect
		.poll(
			() =>
				page.evaluate(async () =>
					(await (await navigator.serviceWorker.ready).getNotifications()).map((n) => n.body)
				),
			{ timeout: 30_000 }
		)
		.toContain(post.title);
	await context.close();
});
