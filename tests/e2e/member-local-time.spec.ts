// A member's local time comes from the zone their browser reported, whoever is looking.
import { expect, test } from '@playwright/test';
import { baseURL, people } from './fixtures.ts';

const pacific = (at: number) =>
	new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/Los_Angeles',
		hour: 'numeric',
		minute: '2-digit'
	}).format(at);

test("a Pacific member's local time, seen from Tokyo", async ({ browser }) => {
	const dee = await browser.newContext({ baseURL, timezoneId: 'America/Los_Angeles' });
	await dee.addCookies([{ name: 'campfire_session', value: people.dee.token, url: baseURL }]);
	const deePage = await dee.newPage();
	const saved = deePage.waitForResponse('**/settings/time-zone');
	await deePage.goto('/');
	expect((await saved).status()).toBe(204);
	await dee.close();

	const eve = await browser.newContext({ baseURL, timezoneId: 'Asia/Tokyo', locale: 'en-US' });
	await eve.addCookies([{ name: 'campfire_session', value: people.eve.token, url: baseURL }]);
	const page = await eve.newPage();
	const before = Date.now();
	await page.goto('/people/dee');
	await expect(page.getByText('(17 h behind)')).toBeVisible();
	const shown = await page.getByText(/ local time$/).textContent();
	const words = (s: string) => s.replace(/\s/g, ' ');
	expect([pacific(before), pacific(Date.now())].map(words)).toContain(
		words(shown!.replace(' local time', ''))
	);
	await eve.close();
});

test('a failed save still reloads the page in the reader’s zone', async ({ browser }) => {
	const fay = await browser.newContext({ baseURL, timezoneId: 'Asia/Kolkata' });
	await fay.addCookies([{ name: 'campfire_session', value: people.fay.token, url: baseURL }]);
	const page = await fay.newPage();
	await page.route('**/settings/time-zone', (route) => route.fulfill({ status: 500 }));
	const failed = page.waitForResponse('**/settings/time-zone');
	const reloaded = page.waitForRequest(/__data\.json/);
	await page.goto('/');
	expect((await failed).status()).toBe(500);
	await reloaded;
	await fay.close();
});
