// Resolving a post with a written resolution, in the browser: the dialog's editor has the post
// composer's tools without its `/` menu, the resolution shows under the post's banner after a
// reload, resolving from a comment still works, and opening the post again clears both.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { editor } from '../../src/lib/strings/editor.ts';
import { posts as postStrings } from '../../src/lib/strings/posts.ts';
import { baseURL, comment, people, posts, project } from './fixtures.ts';

const s = postStrings.resolve;

async function signInAsAda(browser: Browser): Promise<Page> {
	const context = await browser.newContext({ baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	return context.newPage();
}

const dialog = (page: Page) => page.getByRole('dialog', { name: s.dialogTitle });
const tools = (scope: Page | ReturnType<typeof dialog>) =>
	scope.getByRole('toolbar', { name: editor.toolbar }).getByRole('button').allTextContents();
const resolveButton = (page: Page) =>
	page.getByRole('button', { name: postStrings.post.resolve, exact: true });

async function reopen(page: Page) {
	const reopened = page.waitForResponse((r) => r.url().includes('?/unresolve') && r.ok());
	await page.getByRole('button', { name: postStrings.post.unresolve }).click();
	await reopened;
}

test.describe.configure({ mode: 'serial' });

test('the dialog’s editor has the post composer’s tools, and no / menu', async ({ browser }) => {
	const ada = await signInAsAda(browser);
	await ada.goto(`/projects/${project.id}/new`, { waitUntil: 'networkidle' });
	const composerTools = await tools(ada);
	expect(composerTools.length).toBeGreaterThan(0);

	await ada.goto(`/posts/${posts.photos.id}`, { waitUntil: 'networkidle' });
	await resolveButton(ada).click();
	await expect(dialog(ada)).toBeVisible();
	await expect(dialog(ada).getByRole('toolbar', { name: editor.toolbar })).toBeVisible();
	expect(await tools(dialog(ada))).toEqual(composerTools);

	const box = dialog(ada).getByRole('textbox', { name: s.placeholder });
	await box.click();
	await ada.keyboard.type('/');
	await expect(ada.getByRole('listbox', { name: editor.slash.list })).toHaveCount(0);
	await ada.keyboard.press('Escape');
	await ada.context().close();
});

test('a post resolves with a written resolution that outlives a reload, and opening it clears it', async ({
	browser
}) => {
	const ada = await signInAsAda(browser);
	await ada.goto(`/posts/${posts.photos.id}`, { waitUntil: 'networkidle' });
	await resolveButton(ada).click();
	await dialog(ada).getByRole('textbox', { name: s.placeholder }).fill('Shipped on Friday');
	const resolved = ada.waitForResponse((r) => r.url().includes('?/resolve') && r.ok());
	await dialog(ada).getByRole('button', { name: s.submit, exact: true }).click();
	await resolved;

	await ada.reload();
	const banner = ada.getByRole('status').filter({ hasText: 'Resolved by Ada' });
	await expect(banner).toBeVisible();
	await expect(ada.getByText('Shipped on Friday')).toBeVisible();

	await reopen(ada);
	await ada.reload();
	await expect(ada.getByText('Shipped on Friday')).toHaveCount(0);
	await expect(ada.getByRole('status').filter({ hasText: 'Resolved by' })).toHaveCount(0);
	await ada.context().close();
});

test('a post resolves with a comment, and opening it clears that', async ({ browser }) => {
	const ada = await signInAsAda(browser);
	await ada.goto(`/posts/${posts.packing.id}`, { waitUntil: 'networkidle' });
	const resolved = ada.waitForResponse((r) => r.url().includes('?/resolve') && r.ok());
	await ada
		.locator('.thread', { hasText: comment.text })
		.getByRole('button', { name: postStrings.post.resolveWithComment })
		.click();
	await resolved;

	await ada.reload();
	await expect(ada.getByText(postStrings.post.resolvedWith)).toBeVisible();

	await reopen(ada);
	await ada.reload();
	await expect(ada.getByText(postStrings.post.resolvedWith)).toHaveCount(0);
	await ada.context().close();
});
