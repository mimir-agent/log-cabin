// Emoji in every editor: `:` and two letters opens a list, a whole `:name:` converts, and the
// Emoji button opens the reactions picker and puts the pick at the caret. In the post composer,
// the comment box, a new note and chat, plus a phone with the keyboard up. Against the built
// Worker (serve.ts).
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
import { posts as postText } from '../../src/lib/strings/posts.ts';
import { baseURL, crew, notes, people, post, project } from './fixtures.ts';

const desktop = { viewport: { width: 1280, height: 800 } };
const keyboardUp = { ...devices['iPhone 13'], viewport: { width: 390, height: 328 } };

const surfaces = [
	{
		name: 'the post composer',
		path: `/projects/${project.id}/new`,
		box: (page: Page) => page.getByRole('textbox', { name: /^Write something/ })
	},
	{
		name: 'the comment box',
		path: `/posts/${post.id}`,
		box: (page: Page) => page.getByRole('textbox', { name: /^Write a comment/ })
	},
	{
		name: 'a new note',
		path: '/notes/new',
		box: (page: Page) => page.getByRole('textbox', { name: /^Write something/ })
	},
	{
		name: 'chat',
		path: `/chat/${crew.id}`,
		box: (page: Page) => page.getByRole('textbox', { name: /^Write a message/ })
	}
];

/** Ada, signed in on a screen like `use`, at `path`. */
async function open(browser: Browser, use: BrowserContextOptions, path: string) {
	const context = await browser.newContext({ ...use, baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(path, { waitUntil: 'networkidle' });
	return page;
}

/** Whether `target` is what a pointer at its centre would reach, and not something drawn over it. */
const isTopmost = (target: Locator) =>
	target.evaluate((element) => {
		const { left, top, width, height } = element.getBoundingClientRect();
		const hit = document.elementFromPoint(left + width / 2, top + height / 2);
		return hit !== null && element.contains(hit);
	});

const list = (page: Page) => page.getByRole('listbox', { name: editor.emojiTool.list });
const picker = (page: Page) => page.locator(`.popover[aria-label="${editor.emojiTool.button}"]`);
const emojiButton = (page: Page, box: Locator) =>
	page
		.locator('.editor')
		.filter({ has: box })
		.getByRole('button', { name: editor.emojiTool.button, exact: true });

for (const { name, path, box } of surfaces) {
	test(`${name}: :tad then Enter inserts 🎉`, async ({ browser }) => {
		const page = await open(browser, desktop, path);
		await box(page).click();
		await page.keyboard.type(':tad');
		await expect(list(page)).toBeVisible();
		await page.keyboard.press('Enter');
		await expect(list(page)).toBeHidden();
		await expect(box(page)).toHaveText('🎉');
		await page.context().close();
	});

	test(`${name}: Escape closes the : list and leaves what was typed in the box`, async ({
		browser
	}) => {
		const page = await open(browser, desktop, path);
		await box(page).click();
		await page.keyboard.type(':sm');
		await expect(list(page)).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(list(page)).toBeHidden();
		await expect(box(page)).toHaveText(':sm');
		await expect(box(page)).toBeFocused();
		await page.context().close();
	});

	test(`${name}: a typed :tada: becomes 🎉 as the second colon is typed`, async ({ browser }) => {
		const page = await open(browser, desktop, path);
		await box(page).click();
		// Typed at a hand's speed on a fresh page: the first `:name:` converts like the next.
		await page.keyboard.type('Well done :tada:');
		await expect(box(page)).toHaveText('Well done 🎉');
		await page.context().close();
	});

	test(`${name}: the Emoji button opens the picker and the pick lands at the caret`, async ({
		browser
	}) => {
		const page = await open(browser, desktop, path);
		await box(page).click();
		await page.keyboard.type('ab');
		await page.keyboard.press('ArrowLeft');
		await emojiButton(page, box(page)).click();
		await expect(picker(page)).toBeVisible();
		await expect(page.getByRole('searchbox', { name: postText.picker.search })).toBeFocused();
		const cell = picker(page).locator('button.cell').first();
		const glyph = (await cell.innerText()).trim();
		await cell.click();
		await expect(picker(page)).toBeHidden();
		await expect(box(page)).toHaveText(`a${glyph}b`);
		await expect(box(page)).toBeFocused();
		await page.context().close();
	});
}

test('in the post composer the picker is on top', async ({ browser }) => {
	const [{ path, box }] = surfaces;
	const page = await open(browser, desktop, path);
	await box(page).click();
	await emojiButton(page, box(page)).click();
	const cell = picker(page).locator('button.cell').first();
	await expect(cell).toBeVisible();
	await expect.poll(() => isTopmost(cell), 'nothing is drawn over the picker').toBe(true);
	await page.context().close();
});

test(':2 opens nothing, and neither does a time or an address', async ({ browser }) => {
	const page = await open(browser, desktop, '/notes/new');
	const box = surfaces[2].box(page);
	await box.click();
	await page.keyboard.type('Meet at 10:30 or https://example.com/ta');
	await expect(list(page)).toBeHidden();
	await expect(box).toContainText('10:30');
	await page.context().close();
});

test("an org emoji picked in a comment is drawn after it's saved and the page is reloaded", async ({
	browser
}) => {
	const [, { path, box }] = surfaces;
	const page = await open(browser, desktop, path);
	const org = page.locator('img.emoji[alt*="marshmallow"]');
	const before = await org.count();
	await box(page).click();
	await page.keyboard.type(':marshm');
	await expect(list(page)).toBeVisible();
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: postText.comments.submit, exact: true }).click();
	await expect(org).toHaveCount(before + 1);
	await page.reload({ waitUntil: 'networkidle' });
	await expect(org).toHaveCount(before + 1);
	await page.context().close();
});

test('an org emoji picked from the button is saved as the same text and drawn', async ({
	browser
}) => {
	const [, { path, box }] = surfaces;
	const page = await open(browser, desktop, path);
	const org = page.locator('img.emoji[alt*="marshmallow"]');
	const before = await org.count();
	await box(page).click();
	await emojiButton(page, box(page)).click();
	await page.getByRole('searchbox', { name: postText.picker.search }).fill('marshmallow');
	await picker(page).locator('button.cell').first().click();
	await expect(box(page)).toContainText(':marshmallow:');
	await page.getByRole('button', { name: postText.comments.submit, exact: true }).click();
	await expect(org).toHaveCount(before + 1);
	await page.context().close();
});

test.describe('a live note on a phone', () => {
	const phone = { ...devices['iPhone 13'], timezoneId: 'UTC' };
	const path = `/notes/${notes.trip.id}`;
	const body = (page: Page) => page.getByRole('textbox', { name: /^Write something/ });

	test('the Emoji button opens the picker and the pick lands at the caret', async ({ browser }) => {
		const page = await open(browser, phone, path);
		await body(page).tap();
		await page.keyboard.press('Enter');
		await page.keyboard.type('ab');
		await page.keyboard.press('ArrowLeft');
		await emojiButton(page, body(page)).tap();
		await expect(page.getByRole('searchbox', { name: postText.picker.search })).toBeVisible();
		await page.keyboard.type('tada');
		await picker(page).locator('button.cell').first().tap();
		await expect(picker(page)).toBeHidden();
		await expect(body(page)).toContainText('a🎉b');
		await expect(body(page)).toBeFocused();
		await page.context().close();
	});

	test('/emoji then Enter opens a picker that takes typing, and the pick lands at the caret', async ({
		browser
	}) => {
		const page = await open(browser, phone, path);
		await body(page).tap();
		await page.keyboard.press('Enter');
		await page.keyboard.type('b');
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.type('/emoji');
		await page.keyboard.press('Enter');
		await expect(page.getByRole('searchbox', { name: postText.picker.search })).toBeVisible();
		await page.keyboard.type('tada');
		await picker(page).locator('button.cell').first().tap();
		await expect(body(page)).toContainText('🎉b');
		await page.context().close();
	});
});

test.describe('phone, keyboard up (390 × 328)', () => {
	for (const { name, path, box } of surfaces.filter(({ name }) => name !== 'the post composer')) {
		test(`${name}: the : list stays inside what is visible`, async ({ browser }) => {
			const page = await open(browser, keyboardUp, path);
			await box(page).click();
			await page.keyboard.type(':sm');
			await expect(list(page)).toBeVisible();
			const inside = await list(page).evaluate((element) => {
				const { left, top, right, bottom } = element.parentElement!.getBoundingClientRect();
				const view = window.visualViewport!;
				return (
					left >= view.offsetLeft &&
					top >= view.offsetTop &&
					right <= view.offsetLeft + view.width &&
					bottom <= view.offsetTop + view.height
				);
			});
			expect(inside).toBe(true);
			await page.context().close();
		});
	}
});
