// The tags index: create, rename and delete a tag, and an old tag address finding the renamed tag.
import { expect, test } from '@playwright/test';
import { baseURL, people } from './fixtures.ts';

test('tags are created, renamed and deleted from /tags, and the changes survive a reload', async ({
	browser
}) => {
	const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	const page = await context.newPage();
	const row = (name: string) => page.getByRole('listitem').filter({ hasText: `#${name}` });

	await page.goto('/tags', { waitUntil: 'networkidle' });
	await expect(page.getByRole('heading', { name: 'Tags', level: 1 })).toBeVisible();

	await page.getByRole('button', { name: 'New tag' }).click();
	const create = page.getByRole('dialog', { name: 'New tag' });
	await create.getByLabel('Tag name').fill('Camping');
	await create.getByRole('button', { name: 'Create tag' }).click();
	await expect(row('camping')).toContainText('0 posts');
	await page.reload();
	await expect(row('camping')).toBeVisible();

	await row('camping').getByRole('button', { name: 'Rename tag' }).click();
	const rename = page.getByRole('dialog', { name: 'Rename tag' });
	await rename.getByLabel('Tag name').fill('trail-notes');
	await rename.getByRole('button', { name: 'Save' }).click();
	await expect(row('trail-notes')).toBeVisible();
	await page.reload();
	await expect(row('trail-notes')).toBeVisible();
	await expect(row('camping')).toHaveCount(0);

	// The old address finds the renamed tag.
	await page.goto('/tags/camping');
	await expect(page).toHaveURL(/\/tags\/trail-notes$/);
	await expect(page.getByRole('heading', { name: '#trail-notes', level: 1 })).toBeVisible();

	await page.goto('/tags');
	await row('trail-notes').getByRole('button', { name: 'Delete tag' }).click();
	await page
		.getByRole('dialog', { name: 'Delete tag' })
		.getByRole('button', { name: 'Delete tag' })
		.click();
	await expect(row('trail-notes')).toHaveCount(0);
	await page.reload();
	await expect(row('trail-notes')).toHaveCount(0);
	await context.close();
});
