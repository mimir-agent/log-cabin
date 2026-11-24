// The `/` menu's actions (Image or file, Mention someone, Call link, Emoji) and the sets the
// comment box and chat list. Against the built Worker (serve.ts).
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { editor } from '../../src/lib/strings/editor.ts';
import { baseURL, crew, notes, people, post, project } from './fixtures.ts';

const { slash } = editor;

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
		name: 'a note',
		path: `/notes/${notes.trip.id}`,
		box: (page: Page) => page.getByRole('textbox', { name: /^Write something/ })
	},
	{
		name: 'chat',
		path: `/chat/${crew.id}`,
		box: (page: Page) => page.getByRole('textbox', { name: /^Write a message/ })
	}
];

const [, comment, , chat] = surfaces;

/** Ada, signed in at `path`. */
async function open(browser: Browser, path: string) {
	const context = await browser.newContext({
		baseURL,
		viewport: { width: 1280, height: 800 }
	});
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(path, { waitUntil: 'networkidle' });
	// A saved note is a live editor, ready once it says so.
	if (path === `/notes/${notes.trip.id}`) {
		await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
	}
	return page;
}

/** Puts the caret in an empty paragraph at the end of the box, where `/` opens the menu. */
async function writeIn(page: Page, box: Locator) {
	await box.click();
	await page.keyboard.press('ControlOrMeta+End');
	if ((await box.innerText()).trim()) await page.keyboard.press('Enter');
}

const menu = (page: Page) => page.getByRole('listbox', { name: slash.list });
/** Waits for the list to narrow to one item, so Enter doesn't pick from the list before it. */
const onlyOption = (page: Page) => expect(menu(page).getByRole('option')).toHaveCount(1);
const labels = (page: Page) => menu(page).getByRole('option').locator('span[id$="-label"]');

for (const { name, path, box } of surfaces) {
	test(`${name}: /image then Enter opens the file chooser`, async ({ browser }) => {
		const page = await open(browser, path);
		// Listening from the start: the browser reports a chooser only once something listens.
		const chooser = page.waitForEvent('filechooser');
		await writeIn(page, box(page));
		await page.keyboard.type('/image');
		await onlyOption(page);
		await page.keyboard.press('Enter');
		await chooser;
		await expect(box(page)).not.toContainText('/image');
		await page.context().close();
	});

	test(`${name}: /mention then Enter leaves @ and the mention list, and a pick inserts the mention`, async ({
		browser
	}) => {
		const page = await open(browser, path);
		await writeIn(page, box(page));
		await page.keyboard.type('/mention');
		await onlyOption(page);
		await page.keyboard.press('Enter');
		await expect(box(page)).toContainText('@');
		await expect(page.getByRole('listbox', { name: editor.mentionList })).toBeVisible();
		await page.getByRole('option', { name: people.bo.name }).click();
		await expect(box(page).locator('.mention')).toHaveCount(1);
		await page.context().close();
	});

	test(`${name}: /emoji then Enter opens the picker and the pick lands at the caret`, async ({
		browser
	}) => {
		const page = await open(browser, path);
		await writeIn(page, box(page));
		await page.keyboard.type('a b');
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.type('/emoji');
		await onlyOption(page);
		await page.keyboard.press('Enter');
		const picker = page.locator(`.popover[aria-label="${editor.emojiTool.button}"]`);
		await expect(picker).toBeVisible();
		const cell = picker.locator('button.cell').first();
		const glyph = (await cell.innerText()).trim();
		await cell.click();
		await expect(picker).toBeHidden();
		await expect(box(page)).toContainText(`a ${glyph}b`);
		await page.context().close();
	});
}

for (const { name, path, box } of [surfaces[0], surfaces[2], chat]) {
	test(`${name}: /call then Enter inserts a link to Ada's room, which opens it`, async ({
		browser
	}) => {
		const page = await open(browser, path);
		await writeIn(page, box(page));
		await page.keyboard.type('/call');
		await onlyOption(page);
		await page.keyboard.press('Enter');
		const link = box(page).getByRole('link', { name: slash.callLink.label });
		await expect(link).toHaveAttribute('href', `${baseURL}/calls/room/ada`);
		await page.goto(`${baseURL}/calls/room/ada`);
		await expect(page.locator('#room-link')).toHaveValue(`${baseURL}/calls/room/ada`);
		await page.context().close();
	});
}

test('the comment box has no Call link', async ({ browser }) => {
	const page = await open(browser, comment.path);
	await comment.box(page).click();
	await page.keyboard.type('/call');
	await expect(page.getByText(slash.empty)).toBeVisible();
	await page.context().close();
});

test('the new note page has no Image or file', async ({ browser }) => {
	const page = await open(browser, '/notes/new');
	await page.getByRole('textbox', { name: /^Write something/ }).click();
	await page.keyboard.type('/image');
	await expect(page.getByText(slash.empty)).toBeVisible();
	await page.context().close();
});

test('the comment box lists its blocks and actions and nothing else', async ({ browser }) => {
	const page = await open(browser, comment.path);
	await comment.box(page).click();
	await page.keyboard.type('/');
	await expect(labels(page)).toHaveText(
		[
			'text',
			'heading1',
			'heading2',
			'heading3',
			'bulletList',
			'orderedList',
			'taskList',
			'quote',
			'codeBlock',
			'divider',
			'details',
			'file',
			'mention',
			'emoji'
		].map((id) => slash[id as 'text'].label)
	);
	await page.context().close();
});

test('chat lists its blocks and actions and nothing else', async ({ browser }) => {
	const page = await open(browser, chat.path);
	await chat.box(page).click();
	await page.keyboard.type('/');
	await expect(labels(page)).toHaveText(
		['bulletList', 'orderedList', 'quote', 'codeBlock', 'file', 'mention', 'callLink', 'emoji'].map(
			(id) => slash[id as 'text'].label
		)
	);
	await page.context().close();
});

test('in chat, /quote then Enter makes a quote and sends nothing; Enter afterwards sends', async ({
	browser
}) => {
	const page = await open(browser, chat.path);
	const messages = page.locator('[id^="message-"]');
	const before = await messages.count();
	const box = chat.box(page);
	await box.click();
	await page.keyboard.type('/quote');
	await onlyOption(page);
	await page.keyboard.press('Enter');
	await expect(box.locator('blockquote')).toHaveCount(1);
	await expect(messages).toHaveCount(before);
	await page.keyboard.type('Bring the lanterns');
	await page.keyboard.press('Enter');
	await expect(messages.filter({ hasText: 'Bring the lanterns' })).toHaveCount(1);
	await expect(box).toHaveText('');
	await page.context().close();
});
