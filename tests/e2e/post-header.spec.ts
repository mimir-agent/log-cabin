// A post's bar on a phone is back, the title in its own slot, "mark done" when the inbox holds
// something about the post, and "…". The title never runs under an icon, every icon is a 44px
// target, and the page doesn't scroll sideways. Against the built Worker (serve.ts).
import { devices, expect, test } from '@playwright/test';
import { baseURL, people, post, posts } from './fixtures.ts';

const { userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13'];
const long = 'The post button stays grey without a title and that is not obvious to anyone';

// Ada wrote Packing, so she has every action; Gear list is Bo's and has an inbox item for Ada,
// so its bar carries "mark done".
const pages = [
	{ name: 'own post', path: `/posts/${posts.packing.id}` },
	{ name: 'inbox post', path: `/posts/${post.id}` }
];

for (const width of [320, 390, 430]) {
	for (const colorScheme of ['light', 'dark'] as const) {
		for (const { name, path } of pages) {
			test(`${name} bar at ${width}px, ${colorScheme}`, async ({ browser }, testInfo) => {
				const context = await browser.newContext({
					baseURL,
					colorScheme,
					viewport: { width, height: 760 },
					userAgent,
					deviceScaleFactor,
					isMobile,
					hasTouch
				});
				await context.addCookies([
					{ name: 'campfire_session', value: people.ada.token, url: baseURL }
				]);
				const page = await context.newPage();
				await page.goto(path, { waitUntil: 'networkidle' });

				const bar = page.locator('header.page-header:visible');
				const title = bar.locator('h1');
				await title.evaluate((h1, text) => (h1.textContent = text), long);

				const icons = await bar.locator('a:visible, button:visible').all();
				expect(icons.length).toBeGreaterThanOrEqual(2);
				const titleBox = (await title.boundingBox())!;
				for (const icon of icons) {
					const box = (await icon.boundingBox())!;
					const label = await icon.getAttribute('aria-label');
					expect(box.width, `${label} width`).toBeGreaterThanOrEqual(44);
					expect(box.height, `${label} height`).toBeGreaterThanOrEqual(44);
					const apart =
						box.x >= titleBox.x + titleBox.width ||
						box.x + box.width <= titleBox.x ||
						box.y >= titleBox.y + titleBox.height ||
						box.y + box.height <= titleBox.y;
					expect(apart, `${label} sits on the title`).toBe(true);
				}
				expect(await title.evaluate((h1) => h1.scrollWidth > h1.clientWidth)).toBe(true);
				expect(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= document.documentElement.clientWidth
					)
				).toBe(true);

				const shot = testInfo.outputPath(
					`post-bar-${name.replace(' ', '-')}-${width}-${colorScheme}.png`
				);
				await page.screenshot({ path: shot, clip: { x: 0, y: 0, width, height: 120 } });
				await testInfo.attach(`${name} ${width} ${colorScheme}`, {
					path: shot,
					contentType: 'image/png'
				});
				await context.close();
			});
		}
	}
}

test('the menu holds pin, share, follow up, move and resolve on a phone', async ({ browser }) => {
	const context = await browser.newContext({
		baseURL,
		viewport: { width: 390, height: 760 },
		userAgent,
		deviceScaleFactor,
		isMobile,
		hasTouch
	});
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(`/posts/${posts.packing.id}`, { waitUntil: 'networkidle' });
	await page
		.locator('header.page-header:visible')
		.getByRole('button', { name: 'More actions' })
		.click();
	const menu = page.getByRole('menu');
	for (const name of [/pin/i, /share/i, /follow up/i, /move to channel/i, /resolve/i]) {
		await expect(menu.getByText(name).first()).toBeVisible();
	}
	await context.close();
});
