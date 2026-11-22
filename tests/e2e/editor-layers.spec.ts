// What the editor floats (the selection menu's link field, the @ list) shows above the page that
// holds the editor, takes a click or a tap, and stays on screen. The post composer is a dialog;
// the chat composer sits at the bottom of the screen. Against the built Worker (serve.ts).
import {
	devices,
	expect,
	test,
	type Browser,
	type BrowserContextOptions,
	type Locator
} from '@playwright/test';
import { editor } from '../../src/lib/strings/editor.ts';
import { baseURL, crew, people, project } from './fixtures.ts';

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13'];
const profiles: Record<string, { use: BrowserContextOptions; touch: boolean }> = {
	desktop: { use: { viewport: { width: 1280, height: 800 } }, touch: false },
	iPhone: { use: { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch }, touch: true }
};

/** Whether `target` is what a pointer at its centre would reach, and not something drawn over it. */
const isTopmost = (target: Locator) =>
	target.evaluate((element) => {
		const { left, top, width, height } = element.getBoundingClientRect();
		const hit = document.elementFromPoint(left + width / 2, top + height / 2);
		return hit !== null && element.contains(hit);
	});

/** Ada, signed in on a screen like `use`, at `path`. */
async function open(browser: Browser, use: BrowserContextOptions, path: string) {
	const context = await browser.newContext({ ...use, baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(path, { waitUntil: 'networkidle' });
	return page;
}

for (const [name, { use, touch }] of Object.entries(profiles)) {
	const press = (target: Locator) => (touch ? target.tap() : target.click());

	test(`${name}: in the post composer, the selection menu's link field is on top and Apply works`, async ({
		browser
	}) => {
		const page = await open(browser, use, `/projects/${project.id}/new`);
		const body = page.getByRole('textbox', { name: /^Write something/ });
		await press(body);
		await page.keyboard.type('hello world');
		for (let i = 0; i < 'world'.length; i++) await page.keyboard.press('Shift+ArrowLeft');

		await press(page.getByRole('button', { name: editor.link, exact: true }));
		const field = page.getByRole('textbox', { name: editor.linkUrl });
		await expect(field).toBeVisible();
		await expect.poll(() => isTopmost(field), 'nothing is drawn over the field').toBe(true);

		await field.fill('example.com');
		await press(page.getByRole('button', { name: editor.linkApply }));
		await expect(body.locator('a[href="https://example.com"]')).toHaveText('world');
		await page.context().close();
	});

	test(`${name}: in the post composer, the @ list is on top and a ${touch ? 'tap' : 'click'} picks a name`, async ({
		browser
	}) => {
		const page = await open(browser, use, `/projects/${project.id}/new`);
		const body = page.getByRole('textbox', { name: /^Write something/ });
		await press(body);
		await page.keyboard.type('hi @');

		const option = page.getByRole('option').first();
		await expect(option).toBeVisible();
		await expect.poll(() => isTopmost(option), 'nothing is drawn over the option').toBe(true);

		await press(option);
		await expect(body.locator('.mention')).toHaveCount(1);
		await page.context().close();
	});

	test(`${name}: in chat, at the bottom of the screen, the @ list opens upward and every option is on screen`, async ({
		browser
	}) => {
		const page = await open(browser, use, `/chat/${crew.id}`);
		const box = page.getByRole('textbox', { name: /^Write a message/ });
		await press(box);
		await page.keyboard.type('@');

		const options = page.getByRole('option');
		await expect(options.first()).toBeVisible();
		const [typed, shown] = await Promise.all([
			box.boundingBox(),
			options.evaluateAll((all) =>
				all.map((option) => {
					const { top, bottom } = option.getBoundingClientRect();
					return { top, bottom, screen: window.visualViewport!.height };
				})
			)
		]);
		expect(shown.length).toBeGreaterThan(0);
		for (const { top, bottom, screen } of shown) {
			expect(top, 'the option starts on screen').toBeGreaterThanOrEqual(0);
			expect(bottom, 'and ends on screen').toBeLessThanOrEqual(screen);
			expect(bottom, 'not below the box being typed in').toBeLessThanOrEqual(
				typed!.y + typed!.height
			);
		}
		await page.context().close();
	});
}
