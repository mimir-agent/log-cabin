// Mentioning a post with @ in a live note, end to end: the writer picks a post from the @ list,
// another editor who can see the post sees its title at once, and a reader who can't see it
// sees only that something is there.
// `pnpm test:e2e` builds, starts the server (serve.ts) and runs this file.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { baseURL, cave, notes, people, type Person } from './fixtures.ts';

const meeting = notes.meeting;

/** Signs in as `who` in a browser context of their own and opens the meeting note live. */
async function open(browser: Browser, who: Person): Promise<Page> {
	const context = await browser.newContext({ baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(`/notes/${meeting.id}`);
	await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
	return page;
}

/** The note's body: the live editor (the comment box below is another). */
const body = (page: Page) => page.getByRole('textbox', { name: /^Write something/ });
const chip = (page: Page) => body(page).locator('.resource-mention');

test('a post Ada mentions with @ shows its title to Bo, who can see it, and not to Cy', async ({
	browser
}) => {
	const ada = await open(browser, 'ada');
	const bo = await open(browser, 'bo');
	const cy = await open(browser, 'cy');

	await body(ada).locator('p').first().click();
	await ada.keyboard.press('End');
	await ada.keyboard.type(' @Secret');
	await ada.getByRole('option', { name: `${cave.post.title} Post` }).click();
	await expect(chip(ada)).toHaveText(cave.post.title);
	await expect(chip(ada)).toHaveAttribute('href', `/posts/${cave.post.id}`);

	await expect(chip(bo), 'Bo is in the Tunnel project').toHaveText(cave.post.title);
	await expect(chip(bo)).toHaveAttribute('href', `/posts/${cave.post.id}`);

	await expect(chip(cy), 'Cy is not').toHaveText('Thread unavailable');
	await expect(chip(cy)).not.toHaveAttribute('href');
	await expect(cy.getByText(cave.post.title), 'the title is nowhere on her page').toHaveCount(0);

	for (const page of [ada, bo, cy]) await page.context().close();
});
