// A note's own blocks in the live editor, end to end: a collapsible section and a highlighted
// code block written by one editor reach the other and survive a reload, and each reader opens
// and closes the section for themselves.
// `pnpm test:e2e` builds, starts the server (serve.ts) and runs this file.
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { baseURL, notes, people, type Person } from './fixtures.ts';
import { caretTaken, liveContext } from './editor.ts';

const camp = notes.camp;

/** Signs in as `who` in a browser context of their own and opens the camp note live. */
async function open(browser: Browser, who: Person): Promise<Page> {
	const context = await browser.newContext({ baseURL, ...liveContext });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(`/notes/${camp.id}`);
	await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
	return page;
}

/** The note's body: the live editor (the comment box below is another). */
const body = (page: Page) => page.getByRole('textbox', { name: /^Write something/ });
const section = (page: Page) => body(page).locator('[data-type="details"]');
const sectionBody = (page: Page) => section(page).locator('[data-type="detailsContent"]');
const code = (page: Page) => body(page).locator('pre code');
/** The words in a part of the note, without the names on other people's cursors there. */
const words = (part: Locator) =>
	part.evaluate((element) => {
		const copy = element.cloneNode(true) as HTMLElement;
		for (const caret of copy.querySelectorAll('.live-caret')) caret.remove();
		return copy.textContent;
	});
const sectionText = (page: Page) => words(sectionBody(page));

/** Both blocks as everyone should see them: the title and code always, the section's body only when open. */
async function expectBlocks(page: Page) {
	await expect.poll(() => words(section(page).locator('summary'))).toBe('Packing');
	await expect.poll(() => words(code(page))).toBe('const fire = true;');
	await expect(code(page).locator('.hljs-keyword')).toHaveText('const');
}

test.describe.configure({ mode: 'serial' });

test('a section and a js code block one editor writes reach the other and survive a reload', async ({
	browser
}) => {
	const ada = await open(browser, 'ada');
	const bo = await open(browser, 'bo');

	await body(ada).locator('p').first().click();
	await ada.keyboard.press('End');
	await caretTaken(body(ada));
	await ada.keyboard.press('Enter');
	await ada.keyboard.type('```js const fire = true;');
	// Three Enters leave a code block for a new paragraph after it.
	await ada.keyboard.press('Enter');
	await ada.keyboard.press('Enter');
	await ada.keyboard.press('Enter');
	await ada.getByRole('button', { name: 'Collapsible section' }).click();
	await expect(body(ada), 'the toolbar hands the caret back to the note').toBeFocused();
	await ada.keyboard.type('Packing');
	await section(ada).getByRole('button', { name: 'Open section' }).click();
	await sectionBody(ada).locator('p').first().click();
	await caretTaken(body(ada));
	await ada.keyboard.type('Tent and stove');

	await expectBlocks(bo);
	await expect(sectionBody(bo), 'closed for Bo until he opens it').toBeHidden();
	await section(bo).getByRole('button', { name: 'Open section' }).click();
	await expect.poll(() => sectionText(bo)).toBe('Tent and stove');

	await ada.reload();
	await expect(ada.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
	await expectBlocks(ada);
	await expect(sectionBody(ada), 'opening is never stored, so it reopens closed').toBeHidden();
	await bo.reload();
	await expect(bo.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
	await expectBlocks(bo);

	await ada.context().close();
	await bo.context().close();
});

test('each reader opens and closes a section without changing it for anyone else', async ({
	browser
}) => {
	const ada = await open(browser, 'ada');
	const bo = await open(browser, 'bo');
	await section(ada).getByRole('button', { name: 'Open section' }).click();
	await expect(sectionBody(ada)).toBeVisible();

	await section(bo).getByRole('button', { name: 'Open section' }).click();
	await expect.poll(() => sectionText(bo)).toBe('Tent and stove');
	await section(bo).getByRole('button', { name: 'Close section' }).click();
	await expect(sectionBody(bo)).toBeHidden();

	await expect(sectionBody(ada), 'still open for Ada').toBeVisible();
	await expect(section(ada).getByRole('button', { name: 'Close section' })).toBeVisible();

	await ada.context().close();
	await bo.context().close();
});
