// Ctrl+K in a focused editor opens that editor's link field and not the Quick switcher; outside
// an editor it still opens the Quick switcher. Against the built Worker (serve.ts).
import { expect, test, type Page } from '@playwright/test';
import { editor } from '../../src/lib/strings/editor.ts';
import { search } from '../../src/lib/strings/search.ts';
import { liveContext } from './editor.ts';
import { baseURL, notes, people, post, project, threads } from './fixtures.ts';

const surfaces = [
	{ name: 'post composer', path: `/projects/${project.id}/new` },
	{ name: 'comment box', path: `/posts/${post.id}` },
	{ name: 'note', path: `/notes/${notes.trip.id}` },
	{ name: 'chat', path: `/chat/${threads.bo.id}` }
];

/** Ada, signed in, at `path`. */
async function open(page: Page, path: string) {
	await page
		.context()
		.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	await page.goto(path, { waitUntil: 'networkidle' });
	return page.locator('.ProseMirror[contenteditable="true"]').first();
}

const quickSwitcher = (page: Page) => page.getByRole('dialog', { name: search.quick.label });

test.use({ ...liveContext });

for (const { name, path } of surfaces) {
	test(`${name}: Ctrl+K with "world" selected opens the link field over it, and Apply links it`, async ({
		page
	}) => {
		const body = await open(page, path);
		await body.click();
		await page.keyboard.type('hello world');
		for (let i = 0; i < 'world'.length; i++) await page.keyboard.press('Shift+ArrowLeft');

		await page.keyboard.press('Control+k');
		const field = page.getByRole('textbox', { name: editor.linkUrl });
		await expect(field).toBeFocused();
		await expect(quickSwitcher(page)).toHaveCount(0);
		await expect(
			page.getByRole('textbox', { name: editor.linkText }),
			'a selection is the link text already'
		).toHaveCount(0);

		await field.fill('example.com');
		await page.keyboard.press('Enter');
		await expect(body.locator('a[href="https://example.com"]')).toHaveText('world');
	});

	test(`${name}: Ctrl+K with nothing selected asks for an address, and Enter inserts it as a link`, async ({
		page
	}) => {
		const body = await open(page, path);
		await body.click();
		await page.keyboard.type('see ');

		await page.keyboard.press('Control+k');
		await page.getByRole('textbox', { name: editor.linkUrl }).fill('example.org');
		await page.keyboard.press('Enter');
		await expect(body.locator('a[href="https://example.org"]')).toHaveText('example.org');
	});
}

test('outside an editor, Ctrl+K still opens the Quick switcher', async ({ page }) => {
	await open(page, `/projects/${project.id}`);
	await page.keyboard.press('Control+k');
	await expect(quickSwitcher(page)).toBeVisible();
});
