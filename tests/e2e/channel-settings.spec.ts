// A channel's description, emoji and privacy change after it is made, and a link edits in place.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { posts } from '../../src/lib/strings/posts.ts';
import { baseURL, people, type Person } from './fixtures.ts';

// The second test uses the channel the first one makes.
test.describe.configure({ mode: 'serial' });

// Its name sorts after the fixtures' projects, so they stay first in the pickers.
const s = posts.channelSettings;
const emoji = '💬';
const bar = (page: Page) => page.locator('header.page-header:visible');

async function open(browser: Browser, who: Person) {
	const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	return context.newPage();
}

test('description, emoji and privacy change, show where the name shows, and survive a reload', async ({
	browser
}) => {
	const ada = await open(browser, 'ada');
	await ada.goto('/projects', { waitUntil: 'networkidle' });
	await ada.getByLabel(posts.projects.name, { exact: true }).fill('Zephyr camp');
	await ada.getByRole('button', { name: posts.projects.submitCreate }).click();
	await ada.goto('/projects', { waitUntil: 'networkidle' });
	await ada.getByRole('link', { name: 'Zephyr camp' }).first().click();
	await expect(ada).toHaveURL(/\/projects\/[0-9A-Z]+$/);

	await bar(ada).getByRole('button', { name: 'More actions' }).click();
	await ada.getByRole('menuitem', { name: s.menuEdit }).click();
	const dialog = ada.getByRole('dialog', { name: s.title });
	await dialog.getByLabel(s.descriptionLabel).fill('Where we meet');
	await dialog
		.getByRole('group', { name: s.emojiLabel })
		.getByRole('button', { name: emoji })
		.click();
	await dialog.getByRole('radio', { name: s.private }).check();
	await dialog.getByRole('button', { name: s.save, exact: true }).click();
	await expect(dialog).toBeHidden();

	await ada.reload({ waitUntil: 'networkidle' });
	await expect(ada.getByText('Where we meet')).toBeVisible();
	await expect(bar(ada).locator('.mark')).toHaveText(emoji);
	const url = new URL(ada.url());
	await expect(
		ada.locator(`a[href="${url.pathname}"]`).filter({ hasText: emoji }).first()
	).toBeVisible();

	// The channel picker in the new-thread dialog shows it too.
	await ada.goto(`${url.pathname}/new`, { waitUntil: 'networkidle' });
	await expect(ada.getByRole('dialog').locator('.picker')).toContainText(emoji);

	// Private: someone who is not in it can't open it.
	const bo = await open(browser, 'bo');
	const gone = await bo.goto(url.pathname);
	expect(gone?.status()).toBe(404);

	// Back to public: Bo can open it, and the emoji stayed.
	await ada.goto(url.pathname, { waitUntil: 'networkidle' });
	await bar(ada).getByRole('button', { name: 'More actions' }).click();
	await ada.getByRole('menuitem', { name: s.menuEdit }).click();
	await ada.getByRole('dialog', { name: s.title }).getByRole('radio', { name: s.public }).check();
	await ada
		.getByRole('dialog', { name: s.title })
		.getByRole('button', { name: s.save, exact: true })
		.click();
	await expect(ada.getByRole('dialog', { name: s.title })).toBeHidden();
	const there = await bo.goto(url.pathname);
	expect(there?.status()).toBe(200);
	await expect(bar(bo).locator('.mark')).toHaveText(emoji);
});

test('a link edits in place', async ({ browser }) => {
	const ada = await open(browser, 'ada');
	await ada.goto('/projects', { waitUntil: 'networkidle' });
	await ada.getByRole('link', { name: 'Zephyr camp' }).first().click();
	await expect(ada).toHaveURL(/\/projects\/[0-9A-Z]+$/);
	await ada.getByRole('button', { name: posts.bookmarks.add }).click();
	await ada.getByLabel(posts.bookmarks.titleLabel, { exact: true }).fill('Map');
	await ada.getByLabel(posts.bookmarks.urlLabel).fill('https://example.com/map');
	await ada.getByRole('button', { name: posts.bookmarks.submit, exact: true }).click();
	const row = ada.getByRole('listitem').filter({ hasText: 'Map' });
	await row.getByRole('button', { name: s.bookmarkEdit }).click();

	const dialog = ada.getByRole('dialog', { name: s.bookmarkEditTitle });
	await dialog.getByLabel(s.bookmarkTitleLabel).fill('Trail map');
	await dialog.getByLabel(s.bookmarkUrlLabel).fill('https://example.com/trail');
	await dialog.getByRole('button', { name: s.bookmarkSave }).click();
	await expect(dialog).toBeHidden();

	await ada.reload({ waitUntil: 'networkidle' });
	const link = ada.getByRole('link', { name: /Trail map/ });
	await expect(link).toHaveAttribute('href', 'https://example.com/trail');
	await expect(ada.getByRole('link', { name: /^Map/ })).toHaveCount(0);
});
