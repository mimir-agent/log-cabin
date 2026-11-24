// Home's Channels section folds on a tap or a click, and stays folded on the next visit. The
// sidebar's group in the phone's drawer folds the same way.
import { devices, expect, test, type Browser } from '@playwright/test';
import { baseURL, people, project } from './fixtures.ts';

const screens = [
	['a phone', devices['iPhone 13']],
	['a desktop', devices['Desktop Chrome']]
] as const;

async function open(browser: Browser, options: Parameters<Browser['newContext']>[0]) {
	const context = await browser.newContext({ baseURL, ...options });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto('/home', { waitUntil: 'networkidle' });
	return page;
}

for (const [name, device] of screens) {
	test(`on ${name}, Home's Channels folds and unfolds, and stays folded after a reload`, async ({
		browser
	}) => {
		const page = await open(browser, device);
		const main = page.getByRole('main');
		const toggle = main.getByRole('button', { name: 'Channels', expanded: true });
		const channel = main.getByRole('link', { name: project.name });
		const tap = () => (device.hasTouch ? toggle.tap() : toggle.click());

		await expect(channel).toBeVisible();
		await tap();
		await expect(main.getByRole('button', { name: 'Channels', expanded: false })).toBeVisible();
		await expect(channel).toBeHidden();

		await page.reload({ waitUntil: 'networkidle' });
		await expect(channel).toBeHidden();

		await main.getByRole('button', { name: 'Channels', expanded: false }).click();
		await expect(channel).toBeVisible();
	});
}

test("on a phone, the drawer's Channels group folds and unfolds", async ({ browser }) => {
	const page = await open(browser, devices['iPhone 13']);
	await page.getByRole('button', { name: 'Open navigation' }).tap();
	const drawer = page.getByRole('dialog', { name: 'Navigation' });
	const channel = drawer.getByRole('link', { name: project.name });

	await expect(channel).toBeVisible();
	await drawer.getByRole('button', { name: 'Channels', expanded: true }).tap();
	await expect(channel).toBeHidden();
	await drawer.getByRole('button', { name: 'Channels', expanded: false }).tap();
	await expect(channel).toBeVisible();
});
