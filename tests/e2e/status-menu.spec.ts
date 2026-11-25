// Your status is set and cleared from the menu under your avatar: from the sidebar on a desktop
// and from the account tab on a phone. Against the built Worker (serve.ts).
import { devices, expect, test, type BrowserContextOptions } from '@playwright/test';
import { baseURL, people } from './fixtures.ts';

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13'];
const profiles: Record<string, { use: BrowserContextOptions; avatar: string }> = {
	desktop: { use: { viewport: { width: 1280, height: 800 } }, avatar: '.side' },
	iPhone: {
		use: { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch },
		avatar: '.tabs'
	}
};

for (const [name, { use, avatar }] of Object.entries(profiles)) {
	test(`${name}: set a status from the avatar menu, see it on the avatar, then clear it`, async ({
		browser
	}) => {
		const context = await browser.newContext({ ...use, baseURL });
		await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
		const page = await context.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto('/', { waitUntil: 'networkidle' });

		const button = page.locator(avatar).getByRole('button', { name: people.ada.name });
		await button.click();
		await page.getByRole('menuitem', { name: 'Set a status' }).click();
		const dialog = page.getByRole('dialog', { name: 'Status' });
		await dialog.getByRole('button', { name: /^Lunch/ }).click();
		await dialog.getByRole('button', { name: 'Save status' }).click();
		await expect(dialog).toBeHidden();
		await expect(button).toContainText('🥪');

		await button.click();
		await expect(page.getByRole('menu').getByText('Lunch')).toBeVisible();
		await page.getByRole('menuitem', { name: 'Clear status' }).click();
		await expect(button).not.toContainText('🥪');

		await button.click();
		await expect(page.getByRole('menuitem', { name: 'Set a status' })).toBeVisible();
		expect(errors).toEqual([]);
		await context.close();
	});
}
