// The `/` menu in the editors that hold a whole document (a new note, the post composer), on a
// desktop and a phone. Against the built Worker (serve.ts).
import {
	devices,
	expect,
	test,
	type Browser,
	type BrowserContextOptions,
	type Locator,
	type Page
} from '@playwright/test';
import { editor } from '../../src/lib/strings/editor.ts';
import { baseURL, people, project } from './fixtures.ts';

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13'];
const profiles: Record<string, { use: BrowserContextOptions; touch: boolean }> = {
	desktop: { use: { viewport: { width: 1280, height: 800 } }, touch: false },
	iPhone: { use: { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch }, touch: true }
};

const surfaces = [
	{ name: 'a new note', path: '/notes/new' },
	{ name: 'the post composer', path: `/projects/${project.id}/new` }
];

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

const body = (page: Page) => page.getByRole('textbox', { name: /^Write something/ });
const menu = (page: Page) => page.getByRole('listbox', { name: editor.slash.list });
const option = (page: Page, label: string) =>
	page.getByRole('option', { name: label, exact: true });

for (const [profile, { use, touch }] of Object.entries(profiles)) {
	const press = (target: Locator) => (touch ? target.tap() : target.click());

	for (const { name, path } of surfaces) {
		test(`${profile}: in ${name}, / opens the menu and /h2 then Enter makes a Heading 2 without the typed text`, async ({
			browser
		}) => {
			const page = await open(browser, use, path);
			await press(body(page));
			await page.keyboard.type('/');
			await expect(menu(page)).toBeVisible();
			await page.keyboard.type('h2');
			await page.keyboard.press('Enter');
			await expect(menu(page)).toBeHidden();
			await expect(body(page).locator('h2')).toHaveCount(1);
			await expect(body(page)).not.toContainText('/h2');
			await page.context().close();
		});

		test(`${profile}: in ${name}, a ${touch ? 'tap' : 'click'} picks an option`, async ({
			browser
		}) => {
			const page = await open(browser, use, path);
			await press(body(page));
			await page.keyboard.type('/');
			await press(option(page, 'Heading 3'));
			await expect(body(page).locator('h3')).toHaveCount(1);
			await page.context().close();
		});
	}

	test(`${profile}: in the post composer the menu is on top`, async ({ browser }) => {
		const page = await open(browser, use, `/projects/${project.id}/new`);
		await press(body(page));
		await page.keyboard.type('/');
		const first = page.getByRole('option').first();
		await expect(first).toBeVisible();
		await expect.poll(() => isTopmost(first), 'nothing is drawn over the option').toBe(true);
		await page.context().close();
	});
}

for (const { name, path } of surfaces) {
	test(`in ${name}, every item picked from the keyboard makes its block`, async ({ browser }) => {
		const blocks: [string, string][] = [
			['h1', 'h1'],
			['h2', 'h2'],
			['h3', 'h3'],
			['bullet', 'ul:not([data-type="taskList"])'],
			['numbered', 'ol'],
			['todo', 'ul[data-type="taskList"]'],
			['blockquote', 'blockquote'],
			['snippet', 'pre'],
			['hr', 'hr'],
			['toggle', '[data-type="details"]']
		];
		for (const [typed, selector] of blocks) {
			const page = await open(browser, profiles.desktop.use, path);
			await body(page).click();
			await page.keyboard.type(`/${typed}`);
			await page.keyboard.press('Enter');
			await expect(body(page).locator(selector), typed).toHaveCount(1);
			await page.context().close();
		}
	});

	test(`in ${name}, Collapsible section is offered`, async ({ browser }) => {
		const page = await open(browser, profiles.desktop.use, path);
		await body(page).click();
		await page.keyboard.type('/');
		await expect(option(page, editor.slash.emoji.label)).toBeVisible();
		await page.context().close();
	});

	test(`in ${name}, the arrow keys wrap and Escape leaves what was typed`, async ({ browser }) => {
		const page = await open(browser, profiles.desktop.use, path);
		await body(page).click();
		await page.keyboard.type('/');
		await expect(option(page, editor.slash.text.label)).toHaveAttribute('aria-selected', 'true');
		await page.keyboard.press('ArrowUp');
		await expect(option(page, editor.slash.emoji.label)).toHaveAttribute('aria-selected', 'true');
		await page.keyboard.press('ArrowDown');
		await expect(option(page, editor.slash.text.label)).toHaveAttribute('aria-selected', 'true');

		await page.keyboard.type('he');
		await page.keyboard.press('Escape');
		await expect(menu(page)).toBeHidden();
		await expect(body(page)).toContainText('/he');
		await page.context().close();
	});
}
