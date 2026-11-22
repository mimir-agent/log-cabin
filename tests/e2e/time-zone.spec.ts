// Dates and times come from the server already in the reader's zone, so the page shows the
// same time before and after it hydrates.
import { expect, test } from '@playwright/test';
import { baseURL, pastCall, people, zoned } from './fixtures.ts';

// Each reader's moment in `zoned`, as they should see it and as UTC would have it.
const readers = [
	{
		timezoneId: 'America/Los_Angeles',
		local: { day: 'Wednesday, Oct 14, 2026', date: 'Oct 14', clock: '6:30 PM' },
		utc: { day: 'Thursday, Oct 15, 2026', clock: '1:30 AM' }
	},
	{
		timezoneId: 'Asia/Tokyo',
		local: { day: 'Friday, Oct 9, 2026', date: 'Oct 9', clock: '1:45 AM' },
		utc: { day: 'Thursday, Oct 8, 2026', clock: '4:45 PM' }
	}
];

// What each page shows of a moment: its day heading, and the time where the page has one.
const pages = (local: (typeof readers)[number]['local']) => ({
	'/': [local.day],
	'/notes': [local.day],
	'/inbox?tab=read': [local.day, `${local.date}, 2026, ${local.clock}`],
	'/calls': [local.day, local.clock],
	[`/chat/${zoned.threadId}`]: [
		`${local.date} · ${local.clock}`,
		`${local.date}, 2026, ${local.clock}`
	]
});

// Intl puts a narrow no-break space before AM and PM.
const spaced = (html: string) => html.replace(/[\u202f\u00a0]|&nbsp;/g, ' ');

for (const { timezoneId, local, utc } of readers) {
	test(`dates and times are ${timezoneId}'s from the server's first byte`, async ({ browser }) => {
		const context = await browser.newContext({ baseURL, timezoneId });
		await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
		const page = await context.newPage();
		// The first visit tells the server the zone.
		await page.goto('/');
		await expect
			.poll(async () => (await context.cookies()).find((c) => c.name === 'tz')?.value)
			.toBe(timezoneId);

		for (const [path, shown] of Object.entries(pages(local))) {
			const html = spaced(await (await context.request.get(path)).text());
			await page.goto(path, { waitUntil: 'networkidle' });
			const hydrated = spaced(await page.content());
			for (const [when, text] of [
				['from the server', html],
				['hydrated', hydrated]
			]) {
				for (const s of shown) expect.soft(text, `${path} ${when}`).toContain(s);
				expect.soft(text, `${path} ${when}`).not.toContain(utc.day);
				expect.soft(text, `${path} ${when}`).not.toContain(utc.clock);
			}
		}
		await context.close();
	});
}

test("recent calls' times are the reader's from the server's first byte", async ({ browser }) => {
	const context = await browser.newContext({ baseURL, timezoneId: 'America/Los_Angeles' });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	const page = await context.newPage();
	const local = 'Nov 18, 2026, 7:58 PM';

	await page.goto(`/chat/${pastCall.threadId}`);
	await expect(page.getByText(local)).toBeVisible();

	// What the server sends this browser now, before any script runs.
	const html = await (await context.request.get(`/chat/${pastCall.threadId}`)).text();
	expect(html).toContain(local);
	expect(html).not.toContain('Nov 19, 2026, 3:58 AM');
	await context.close();
});
