// What a live note shares with posts, end to end: a checklist an editor ticks, a pasted link's
// preview, a reminder, a pin to the note's project and reactions with the org's own emoji on
// the note and on a comment. Each one is still there after a reload.
// `pnpm test:e2e` builds, starts the server (serve.ts) and runs this file. The link's preview
// is seeded as already fetched (serve.ts), so the server never goes to the web for it.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { baseURL, people, snow, type Person } from './fixtures.ts';
import { caretTaken, liveContext } from './editor.ts';

const { note, comment, link, emoji } = snow;

/** Signs in as `who` in a browser context of their own and opens the snow note live. */
async function open(browser: Browser, who: Person): Promise<Page> {
	const context = await browser.newContext({
		baseURL,
		...liveContext,
		viewport: { width: 1280, height: 800 }
	});
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(`/notes/${note.id}`);
	await connected(page);
	return page;
}

async function connected(page: Page) {
	await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
}

async function reload(page: Page) {
	await page.reload();
	await connected(page);
}

/** The note's body: the live editor (the comment box below is another). */
const body = (page: Page) => page.getByRole('textbox', { name: /^Write something/ });

/** A new paragraph at the end of the note's body, with the caret in it. */
async function newLine(page: Page) {
	await expect(body(page), 'the editor has started').toHaveAttribute('contenteditable', 'true');
	await body(page).getByText(note.text, { exact: true }).click();
	await page.keyboard.press('ControlOrMeta+End');
	await caretTaken(body(page));
	await page.keyboard.press('Enter');
}

/** Picks the org's own emoji from the full picker that `add` opens. */
async function reactWithOwnEmoji(page: Page, add: ReturnType<Page['getByRole']>) {
	await add.click();
	// The picker's popover is labelled like the button that opens it; its search is the only one.
	await page.getByRole('searchbox', { name: 'Search emoji' }).fill(emoji.name);
	await page.locator(`button.cell[title=":${emoji.name}:"]`).click();
}

test('a checklist item an editor ticks in the live note is ticked for everyone, after a reload too', async ({
	browser
}) => {
	const bo = await open(browser, 'bo');
	const ada = await open(browser, 'ada');

	await newLine(bo);
	await bo.getByRole('button', { name: 'Checklist', exact: true }).click();
	await expect(body(bo), 'the toolbar hands the caret back to the note').toBeFocused();
	await bo.keyboard.type('Chains');
	const box = (page: Page) => body(page).getByRole('checkbox', { name: /Chains/ });
	await expect(box(bo)).not.toBeChecked();
	await box(bo).check();

	await expect(box(ada), 'Ada sees Bo’s tick live').toBeChecked();
	await reload(bo);
	await expect(box(bo), 'still ticked after a reload').toBeChecked();
	await expect(body(bo).getByRole('listitem').locator('p')).toHaveText('Chains');
	await reload(ada);
	await expect(box(ada)).toBeChecked();

	await ada.context().close();
	await bo.context().close();
});

test('a link pasted on a line of its own shows its preview, after a reload too', async ({
	browser
}) => {
	const bo = await open(browser, 'bo');
	await newLine(bo);
	await body(bo).evaluate((element, url) => {
		const data = new DataTransfer();
		data.setData('text/plain', url);
		element.dispatchEvent(
			new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
		);
	}, link.url);
	await expect(body(bo).getByRole('link', { name: link.url })).toBeVisible();

	const card = (page: Page) =>
		page.locator('.body').getByRole('link', { name: new RegExp(link.title) });
	await expect(card(bo)).toBeVisible();
	await expect(card(bo)).toContainText(link.description);

	await reload(bo);
	await expect(card(bo), 'the preview is back after a reload').toBeVisible();
	const ada = await open(browser, 'ada');
	await expect(card(ada), 'and Ada sees it too').toBeVisible();

	await ada.context().close();
	await bo.context().close();
});

test('a reminder set from Remind me on the note is still set after a reload', async ({
	browser
}) => {
	const ada = await open(browser, 'ada');
	await ada.getByRole('button', { name: 'Follow up', exact: true }).click();
	await ada.getByRole('menuitem', { name: 'Tomorrow at 9 AM' }).click();
	const set = ada.getByRole('button', { name: /^Follow up:/ });
	await expect(set).toBeVisible();

	await reload(ada);
	await expect(set, 'still set after a reload').toBeVisible();
	await set.click();
	await expect(ada.getByRole('menuitem', { name: 'Remove follow up' })).toBeVisible();
	await ada.keyboard.press('Escape');

	await ada.goto('/follow-ups');
	await expect(ada.getByRole('main').getByRole('link', { name: note.title })).toBeVisible();
	await ada.context().close();
});

test('the note pinned to its project stays pinned after a reload and shows at the project’s top', async ({
	browser
}) => {
	const ada = await open(browser, 'ada');
	await ada.getByRole('button', { name: 'Pin to channel' }).click();
	const unpin = ada.getByRole('button', { name: 'Unpin', exact: true });
	await expect(unpin).toHaveAttribute('aria-pressed', 'true');
	await expect(ada).toHaveURL(new RegExp(`/notes/${note.id}$`));

	await reload(ada);
	await expect(unpin, 'still pinned after a reload').toHaveAttribute('aria-pressed', 'true');

	await ada.goto(`/projects/${snow.project.id}`);
	const pinned = ada.getByRole('region', { name: 'Pinned' });
	await expect(pinned.getByRole('link', { name: note.title })).toBeVisible();
	await ada.context().close();
});

test('the org’s own emoji picked as a reaction on the note and on a comment stays after a reload', async ({
	browser
}) => {
	const ada = await open(browser, 'ada');
	const label = `:${emoji.name}: ${people.ada.name}`;

	const noteReactions = ada.locator('article').getByRole('group', { name: 'Reactions' });
	await reactWithOwnEmoji(ada, noteReactions.getByRole('button', { name: 'Add reaction' }));
	const notePill = noteReactions.getByRole('button', { name: label });
	await expect(notePill).toHaveAttribute('aria-pressed', 'true');
	await expect(notePill.locator('img')).toHaveAttribute('alt', `:${emoji.name}:`);

	const thread = ada.locator(`#comment-${comment.id}`);
	await expect(thread).toContainText(comment.text);
	await thread.hover();
	await reactWithOwnEmoji(ada, thread.getByRole('button', { name: 'Add reaction' }));
	const commentPill = thread.getByRole('button', { name: label });
	await expect(commentPill).toHaveAttribute('aria-pressed', 'true');

	await reload(ada);
	await expect(notePill, 'the note’s reaction is still there after a reload').toBeVisible();
	await expect(commentPill, 'and the comment’s').toBeVisible();
	await expect(notePill.locator('img')).toHaveAttribute('alt', `:${emoji.name}:`);
	await ada.context().close();
});
