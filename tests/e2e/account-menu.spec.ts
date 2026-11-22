// The menu under your avatar is the way to your own settings, on a desktop from the sidebar and
// on a phone from the navigation drawer. Against the built Worker (serve.ts).
import { devices, expect, test, type BrowserContextOptions } from '@playwright/test';
import { baseURL, people } from './fixtures.ts';

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13'];
const profiles: Record<string, { use: BrowserContextOptions; phone: boolean }> = {
	desktop: { use: { viewport: { width: 1280, height: 800 } }, phone: false },
	iPhone: { use: { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch }, phone: true }
};

for (const [name, { use, phone }] of Object.entries(profiles)) {
	test(`${name}: the avatar opens the account menu, and Profile goes to your settings`, async ({
		browser
	}) => {
		const context = await browser.newContext({ ...use, baseURL });
		await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
		const page = await context.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto('/', { waitUntil: 'networkidle' });

		if (phone) await page.getByRole('button', { name: 'Open navigation' }).first().click();
		const surface = page.locator(phone ? '.drawer' : '.side');
		await surface.getByRole('button', { name: people.ada.name }).click();
		const menu = page.getByRole('menu');
		await expect(menu.getByRole('group', { name: people.ada.name })).toBeVisible();
		await menu.getByRole('menuitem', { name: 'Profile' }).click();

		await expect(page).toHaveURL('/settings/profile');
		await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
		expect(errors).toEqual([]);
		await context.close();
	});
}

test('/settings opens your profile settings', async ({ browser }) => {
	const context = await browser.newContext({ baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto('/settings');
	await expect(page).toHaveURL('/settings/profile');
	await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
	await context.close();
});
