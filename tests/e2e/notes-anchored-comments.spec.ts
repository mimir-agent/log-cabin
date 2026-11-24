// Comments on words in a live note, end to end: Cy, who may only view the note, comments on a
// phrase; Bo, who edits it, types around the phrase and then deletes it. The highlight follows
// the words in both browsers, and the comment outlives them.
// `pnpm test:e2e` builds, starts the server (serve.ts) and runs this file.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { baseURL, notes, people, type Person } from './fixtures.ts';
import { caretTaken, liveContext } from './editor.ts';

const route = notes.route;
const phrase = 'north gate';
const remark = 'Which side of the gate?';

/** Signs in as `who` in a browser context of their own and opens the route note live. */
async function open(browser: Browser, who: Person): Promise<Page> {
	const context = await browser.newContext({ baseURL, ...liveContext });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(`/notes/${route.id}`);
	await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
	return page;
}

/** The note's body: the live editor (the comment box below is another). */
const body = (page: Page) => page.getByRole('textbox', { name: /^Write something/ });
const highlight = (page: Page) => body(page).locator('.note-comment');
/** The note's text as written, without the names on other people's cursors. */
const written = (page: Page) =>
	body(page).evaluate((element) => {
		const copy = element.cloneNode(true) as HTMLElement;
		for (const caret of copy.querySelectorAll('.live-caret')) caret.remove();
		return copy.textContent ?? '';
	});

/** Selects `words` in the note's body, as dragging over them would. */
async function select(page: Page, words: string) {
	await body(page).evaluate((element, words) => {
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const at = node.textContent!.indexOf(words);
			if (at < 0) continue;
			const range = document.createRange();
			range.setStart(node, at);
			range.setEnd(node, at + words.length);
			getSelection()!.removeAllRanges();
			getSelection()!.addRange(range);
			return;
		}
		throw new Error(`expected "${words}" in the note`);
	}, words);
}

test('a comment on a phrase follows it through someone else’s edits and outlives it', async ({
	browser
}) => {
	const cy = await open(browser, 'cy');
	const bo = await open(browser, 'bo');
	await expect(body(cy)).toHaveAttribute('contenteditable', 'false');

	// Cy can only view, and comments on the phrase all the same.
	await select(cy, phrase);
	await cy.locator('.passage-tools').getByRole('button', { name: 'Comment' }).click();
	const form = cy.getByLabel('Comment on the selected words');
	await form.getByRole('textbox', { name: 'Comment on this…' }).fill(remark);
	await form.getByRole('button', { name: 'Comment' }).click();
	await expect(form).toBeHidden();

	await expect(highlight(cy)).toHaveText(phrase);
	await expect(highlight(bo)).toHaveText(phrase);

	// Bo types in the same paragraph, before the phrase, while Cy has the note open.
	await body(bo)
		.locator('p')
		.first()
		.click({ position: { x: 2, y: 4 } });
	await bo.keyboard.press('Home');
	await caretTaken(body(bo));
	await bo.keyboard.type('Early: ', { delay: 20 });
	await expect.poll(() => written(cy)).toContain('Early: Meet at the north gate');
	await expect(highlight(cy)).toHaveText(phrase);
	await expect(highlight(bo)).toHaveText(phrase);

	// Clicking the words opens their comment.
	await highlight(cy).click();
	const thread = cy.getByLabel('Comment on these words');
	await expect(thread).toContainText(remark);
	await expect(thread.getByRole('link', { name: 'Show in comments' })).toHaveAttribute(
		'href',
		/#comment-/
	);
	await cy.keyboard.press('Escape');
	await expect(thread).toBeHidden();

	// Bo deletes the phrase: the comment stays in the list, and nothing is highlighted.
	await body(bo).focus();
	await select(bo, phrase);
	await bo.keyboard.press('Backspace');
	await expect(body(cy)).not.toContainText(phrase);
	for (const page of [cy, bo]) {
		await expect(highlight(page)).toHaveCount(0);
		await expect(page.locator('#comments')).toContainText(remark);
	}
	await cy.context().close();
	await bo.context().close();
});
