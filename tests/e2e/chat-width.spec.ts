// A conversation fits the screen it is on: pictures, a word too long to break and all, nothing
// is wider than the viewport, so a phone never scrolls sideways. Against the built Worker (serve.ts).
import { devices, expect, test } from '@playwright/test';
import { baseURL, people, photos } from './fixtures.ts';

const { userAgent, deviceScaleFactor } = devices['iPhone 13'];

for (const width of [320, 360, 393, 1280]) {
	test(`a conversation of pictures and a long word is ${width}px wide at ${width}px`, async ({
		browser
	}) => {
		const phone = width < 600;
		const context = await browser.newContext({
			baseURL,
			viewport: { width, height: 700 },
			...(phone ? { userAgent, deviceScaleFactor, isMobile: true, hasTouch: true } : {})
		});
		await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
		const page = await context.newPage();
		await page.goto(`/chat/${photos.id}`, { waitUntil: 'networkidle' });
		await expect(page.locator('.gallery')).toHaveCount(3);

		const { inner, scroll, wide } = await page.evaluate(() => ({
			inner: innerWidth,
			scroll: document.documentElement.scrollWidth,
			wide: [...document.querySelectorAll('body *')]
				.filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
				.map((e) => `${e.tagName}.${e.className}`)
		}));
		expect({ inner, scroll, wide }).toEqual({ inner: width, scroll: width, wide: [] });
		await context.close();
	});
}
