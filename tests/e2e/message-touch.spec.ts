// Reacting to a message on a touch screen: a long press opens its menu with the quick reactions
// on top, whatever the screen's width, and a desktop pointer's menu has no such row.
import { devices, expect, test, type Browser } from '@playwright/test';
import { baseURL, crew, people } from './fixtures.ts';

async function open(browser: Browser, options: Parameters<Browser['newContext']>[0]) {
	const context = await browser.newContext({ baseURL, ...options });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(`/chat/${crew.id}`, { waitUntil: 'networkidle' });
	return page;
}

const touchScreens = [
	['an iPhone', devices['iPhone 13'], '👍'],
	['an iPad in landscape', devices['iPad Pro 11 landscape'], '❤️']
] as const;

for (const [name, device, emoji] of touchScreens) {
	test(`on ${name}, a long press on a message opens its menu with quick reactions, and one reacts`, async ({
		browser
	}) => {
		const page = await open(browser, device);
		const message = page.locator('.message').nth(10);
		const bubble = message.locator('.bubble');
		// Near the top of the screen, so the finger lifts clear of the menu that opens below it:
		// a lift over an item would be a tap on it.
		await bubble.scrollIntoViewIfNeeded();
		const top = (await bubble.boundingBox())!.y;
		await page.evaluate((distance) => scrollBy(0, distance), top - 150);
		await page.waitForTimeout(300);
		const box = (await bubble.boundingBox())!;
		const touch = await page.context().newCDPSession(page);
		const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
		await page.waitForTimeout(700);
		await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

		const menu = page.getByRole('menu');
		await expect(menu.getByRole('button', { name: /^React with / })).toHaveCount(5);
		await expect(menu.getByRole('button', { name: 'Add reaction' })).toBeVisible();

		await menu.getByRole('button', { name: `React with ${emoji}` }).tap();
		await expect(menu).toBeHidden();
		await expect(
			message.locator('.reactions button[aria-pressed="true"]').filter({ hasText: emoji })
		).toBeVisible();
		await page.context().close();
	});
}

test('with a mouse, a message’s menu has no row of quick reactions', async ({ browser }) => {
	const page = await open(browser, { viewport: { width: 1280, height: 800 } });
	const row = page.locator('.row').last();
	await row.hover();
	await row.getByRole('button', { name: 'More' }).click();

	await expect(page.getByRole('menu').getByRole('menuitem').first()).toBeVisible();
	await expect(page.getByRole('menu').getByRole('button', { name: /^React with / })).toHaveCount(0);
	await page.context().close();
});
