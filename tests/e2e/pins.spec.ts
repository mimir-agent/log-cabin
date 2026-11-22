// Pinning from a post's own page: the pin lands at the project's top, and you stay on the post.
import { expect, test } from '@playwright/test';
import { baseURL, people, project } from './fixtures.ts';

test('a post pinned from its page shows at the top of its project, and the page stays put', async ({
	browser
}) => {
	const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	const page = await context.newPage();

	await page.goto(`/projects/${project.id}/new`, { waitUntil: 'networkidle' });
	const dialog = page.getByRole('dialog', { name: 'New thread' });
	await dialog.getByPlaceholder('Title').fill('Tent options');
	await dialog.locator('.ProseMirror').click();
	await page.keyboard.type('Which tent for the weekend?');
	await dialog.getByRole('button', { name: 'Start thread', exact: true }).click();
	// Posting from the dialog stays on the page underneath; the toast links to the post.
	await page.getByRole('link', { name: 'View', exact: true }).click();
	await expect(page).toHaveURL(/\/posts\/[0-9A-Z]+$/);
	const postUrl = page.url();

	await page.getByRole('button', { name: 'Pin to channel' }).click();
	await expect(page.getByRole('button', { name: 'Unpin', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page).toHaveURL(postUrl);

	await page.goto(`/projects/${project.id}`);
	const pinned = page.getByRole('region', { name: 'Pinned' });
	await expect(pinned.getByRole('link', { name: 'Tent options' })).toBeVisible();
	await context.close();
});
