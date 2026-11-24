// Copying a new invitation link takes one click, and falls back to selecting the link when the
// browser refuses the clipboard.
import { expect, test, type Browser } from '@playwright/test';
import { baseURL, people } from './fixtures.ts';

/** Eve, the admin, on the invitations page with a link just created. */
async function withNewLink(browser: Browser) {
	const context = await browser.newContext({ baseURL });
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await context.addCookies([{ name: 'campfire_session', value: people.eve.token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto('/settings/invites', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Create link', exact: true }).click();
	const field = page.getByRole('textbox', { name: 'Invitation link' });
	await expect(field).toHaveValue(/\/invite\/[A-Za-z0-9_-]+$/);
	return { page, field };
}

test('one click copies the new link and says Copied for about two seconds', async ({ browser }) => {
	const { page, field } = await withNewLink(browser);

	await page.getByRole('button', { name: 'Copy link', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await field.inputValue());

	await expect(page.getByRole('button', { name: 'Copy link', exact: true })).toBeVisible({
		timeout: 3000
	});
});

test('a refused clipboard selects the link instead', async ({ browser }) => {
	const { page, field } = await withNewLink(browser);
	await page.evaluate(() => {
		navigator.clipboard.writeText = () => Promise.reject(new DOMException('', 'NotAllowedError'));
	});

	await page.getByRole('button', { name: 'Copy link', exact: true }).click();
	await expect(field).toBeFocused();
	expect(
		await field.evaluate((el: HTMLInputElement) =>
			el.value.slice(el.selectionStart!, el.selectionEnd!)
		)
	).toBe(await field.inputValue());
	await expect(page.getByRole('button', { name: 'Copied', exact: true })).toHaveCount(0);
});
