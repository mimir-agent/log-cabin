// Posts in the browser, end to end: checklists, drafts, polls, versions and the image
// gallery, against the built Worker under `wrangler dev` (serve.ts seeds fixtures.ts).
import { expect, test, type Browser, type Page } from '@playwright/test';
import { baseURL, comment, notes, people, posts, project, type Person } from './fixtures.ts';

async function signIn(browser: Browser, who: Person): Promise<Page> {
	const context = await browser.newContext({ baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	return context.newPage();
}

/** The checkbox of the checklist item reading `item`. */
const task = (page: Page, item: string) =>
	page.locator('li', { hasText: item }).getByRole('checkbox');

test.describe.configure({ mode: 'serial' });

test('ticks in a post and in a comment are still there after a reload', async ({ browser }) => {
	const bo = await signIn(browser, 'bo');
	await bo.goto(`/posts/${posts.packing.id}`);
	const tick = bo.waitForResponse((r) => r.url().includes('?/tick') && r.ok());
	await task(bo, 'Lanterns').check();
	await tick;
	await bo.reload();
	await expect(task(bo, 'Lanterns')).toBeChecked();
	await expect(task(bo, 'Tents')).not.toBeChecked();

	const again = bo.waitForResponse((r) => r.url().includes('?/tick') && r.ok());
	await task(bo, comment.text).check();
	await again;
	await bo.reload();
	await expect(task(bo, comment.text)).toBeChecked();
	await bo.context().close();
});

test('a tick in a live note is still there after a reload', async ({ browser }) => {
	const ada = await signIn(browser, 'ada');
	await ada.goto(`/notes/${notes.tasks.id}`);
	const connected = ada.getByRole('status').filter({ hasText: 'All changes saved' });
	await expect(connected).toBeVisible();
	await task(ada, 'Stack wood').check();
	await ada.reload();
	await expect(connected).toBeVisible();
	await expect(task(ada, 'Stack wood')).toBeChecked();
	await expect(task(ada, 'Sweep')).not.toBeChecked();
	await ada.context().close();
});

test('a draft saves itself, opens in a second browser, stays private, and publishes', async ({
	browser
}) => {
	const first = await signIn(browser, 'ada');
	await first.goto(`/projects/${project.id}/new`);
	await first.getByRole('textbox', { name: 'Title' }).fill('Zephyr draft');
	await first.getByRole('textbox', { name: /^Write something/ }).fill('Bring the kettle');
	await expect(first.getByText(/^Draft saved/)).toBeVisible({ timeout: 10_000 });

	const second = await signIn(browser, 'ada');
	await second.goto('/drafts');
	const link = second.getByRole('link', { name: 'Zephyr draft' });
	const draftUrl = String(await link.getAttribute('href'));
	await link.click();
	await expect(second.getByRole('textbox', { name: /^Write something/ })).toHaveText(
		'Bring the kettle'
	);

	const bo = await signIn(browser, 'bo');
	await bo.goto('/drafts');
	await expect(bo.getByText('Zephyr draft')).toHaveCount(0);
	expect((await bo.goto(draftUrl))?.status()).toBe(404);
	await bo.goto('/');
	await expect(bo.getByText('Zephyr draft')).toHaveCount(0);

	await second.getByRole('button', { name: 'Start thread' }).click();
	await expect(second).toHaveURL(/\/posts\/[0-9A-Z]{26}$/);
	await second.goto('/drafts');
	await expect(second.getByText('Zephyr draft')).toHaveCount(0);
	await bo.goto('/');
	await expect(bo.getByRole('link', { name: 'Zephyr draft' })).toBeVisible();
	for (const page of [first, second, bo]) await page.context().close();
});

test('a draft that fails to save offline saves and publishes once back online', async ({
	browser
}) => {
	const ada = await signIn(browser, 'ada');
	await ada.goto(`/projects/${project.id}/new`);
	// The body's editor exists only once the page is live, which offline it never would be.
	const body = ada.getByRole('textbox', { name: /^Write something/ });
	await expect(body).toBeVisible();
	await ada.context().setOffline(true);
	await body.fill('Written offline');
	await expect(ada.getByText(/^Couldn’t save the draft/)).toBeVisible({ timeout: 10_000 });

	await ada.context().setOffline(false);
	await ada.getByRole('textbox', { name: 'Title' }).fill('Offline draft');
	await expect(ada.getByText(/^Draft saved/)).toBeVisible({ timeout: 10_000 });
	await ada.getByRole('button', { name: 'Start thread' }).click();
	await expect(ada.getByText('Thread created')).toBeVisible();
	await expect(ada.getByRole('link', { name: 'Offline draft' })).toBeVisible();
	await ada.context().close();
});

test('a poll takes votes, lets a vote change, and shows who voted', async ({ browser }) => {
	const ada = await signIn(browser, 'ada');
	await ada.goto(`/projects/${project.id}/new`);
	await ada.getByRole('textbox', { name: 'Title' }).fill('Where to camp');
	await ada.getByRole('textbox', { name: /^Write something/ }).fill('Pick one');
	await ada.getByRole('button', { name: 'Add a poll' }).click();
	await ada.getByRole('textbox', { name: 'Option 1' }).fill('Lake');
	await ada.getByRole('textbox', { name: 'Option 2' }).fill('Hills');
	await ada.getByRole('button', { name: 'Start thread' }).click();
	const view = ada.getByRole('link', { name: 'View' });
	await expect(view).toHaveAttribute('href', /\/posts\/[0-9A-Z]{26}$/);

	const bo = await signIn(browser, 'bo');
	await bo.goto(String(await view.getAttribute('href')));
	await bo.getByRole('button', { name: 'Vote for Lake' }).click();
	await expect(bo.getByRole('button', { name: 'Vote for Lake' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await bo.getByRole('button', { name: 'Vote for Hills' }).click();
	await expect(bo.getByRole('button', { name: 'Vote for Hills' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(bo.getByText('1 vote', { exact: true }).last()).toBeVisible();
	const hills = bo.locator('li', { hasText: 'Hills' });
	await hills.getByText('1 vote').click();
	await expect(hills.getByText('Bo')).toBeVisible();
	for (const page of [ada, bo]) await page.context().close();
});

test('a new version links to the old one, which stays readable', async ({ browser }) => {
	const ada = await signIn(browser, 'ada');
	await ada.goto(`/posts/${posts.packing.id}`, { waitUntil: 'networkidle' });
	await ada
		.locator('header.page-header:visible')
		.getByRole('button', { name: 'More actions' })
		.click();
	await ada.getByRole('menuitem', { name: 'New version' }).click();
	await expect(ada).toHaveURL(/\/posts\/[0-9A-Z]{26}\/edit$/);
	await ada.getByRole('textbox', { name: 'Title' }).fill('Packing, take two');
	await ada.getByRole('button', { name: 'Save' }).click();
	await expect(ada.getByRole('link', { name: 'Version 2 · 2 versions' })).toBeVisible();

	await ada.getByRole('link', { name: 'Version 2 · 2 versions' }).click();
	await expect(ada.getByRole('main').getByRole('listitem')).toHaveText([
		/Version 2 · Packing, take two/,
		/Version 1 · Packing/
	]);
	await ada.getByRole('link', { name: /Version 1/ }).click();
	await expect(ada.getByText('You’re reading version 1. A newer version exists.')).toBeVisible();
	await expect(task(ada, 'Lanterns')).toBeVisible();
	await ada.context().close();
});

test('four images show as a gallery and the lightbox steps through them by keyboard', async ({
	browser
}) => {
	const ada = await signIn(browser, 'ada');
	await ada.goto(`/posts/${posts.photos.id}`);
	const gallery = ada.getByRole('group', { name: '4 images' });
	await expect(gallery.getByRole('img')).toHaveCount(4);
	await expect
		.poll(() =>
			gallery
				.getByRole('img')
				.evaluateAll((all) => all.map((i) => (i as HTMLImageElement).naturalWidth))
		)
		.toEqual([32, 32, 32, 32]);

	await ada.getByRole('button', { name: 'Open photo-2.png' }).click();
	const dialog = ada.getByRole('dialog');
	await expect(dialog.getByText('2 of 4')).toBeVisible();
	// The arrows act from inside the viewer, where opening it moves focus.
	await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
	await expect(dialog.getByRole('img')).toHaveAttribute('alt', 'photo-2.png');
	await ada.keyboard.press('ArrowRight');
	await expect(dialog.getByRole('img')).toHaveAttribute('alt', 'photo-3.png');
	await ada.keyboard.press('ArrowLeft');
	await ada.keyboard.press('ArrowLeft');
	await ada.keyboard.press('ArrowLeft');
	await expect(dialog.getByText('4 of 4')).toBeVisible();
	await ada.screenshot({ path: 'test-results/lightbox.png' });
	await ada.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await ada.context().close();
});
