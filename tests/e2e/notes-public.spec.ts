// Publishing a note to the web, end to end: an editor publishes from the Share popover, a
// signed-out browser reads the note at the copied link, and once the editor disables it the
// same link is a 404. `pnpm test:e2e` builds, starts the server (serve.ts) and runs this file.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { baseURL, notes, people } from './fixtures.ts';

// Ada wrote the old note and shares it with nobody, so no other spec changes its sharing.
const note = notes.old;

/** Ada's note page, in a context of her own that may use the clipboard. */
async function openAsAda(browser: Browser): Promise<Page> {
	const context = await browser.newContext({ baseURL });
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(`/notes/${note.id}`);
	await expect(page.getByRole('link', { name: 'Comments' })).toBeVisible();
	return page;
}

/** Opens `url` in a fresh signed-out context: no cookies, no cache. */
async function visitSignedOut(browser: Browser, url: string) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const response = await page.goto(url);
	return { page, status: response?.status() };
}

test('a published note reads signed out until its editor disables it', async ({ browser }) => {
	const ada = await openAsAda(browser);

	await ada.getByRole('button', { name: 'Share', exact: true }).click();
	await ada.getByRole('button', { name: 'Publish', exact: true }).click();
	const field = ada.getByRole('textbox', { name: 'Public link to this doc' });
	await expect(field).toHaveValue(/\/p\/notes\/[A-Za-z0-9_-]{43}$/);
	await ada.getByRole('button', { name: 'Copy', exact: true }).click();
	const url = await ada.evaluate(() => navigator.clipboard.readText());
	expect(url, 'the copied link is the one shown').toBe(await field.inputValue());

	const reader = await visitSignedOut(browser, url);
	expect(reader.status).toBe(200);
	await expect(reader.page.getByRole('heading', { name: note.title })).toBeVisible();
	await expect(reader.page.getByText('north gate')).toBeVisible();
	await reader.page.context().close();

	await ada.getByRole('button', { name: 'Disable', exact: true }).click();
	await expect(ada.getByRole('button', { name: 'Publish', exact: true })).toBeVisible();

	const late = await visitSignedOut(browser, url);
	expect(late.status, 'the disabled link is gone').toBe(404);
	await expect(late.page.getByRole('heading', { name: 'Link not found' })).toBeVisible();
	await late.page.context().close();
});
