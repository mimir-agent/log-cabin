// The New menu: the sidebar's button, the phone's + and `c` ask what you are making. The
// feed's inline composer and the Docs bar's New doc know already and open no menu.
import { expect, test, type Browser, type BrowserContextOptions } from '@playwright/test';
import { baseURL, people, project } from './fixtures.ts';

const name = 'Start a thread or a document';
// The phone's + is drawn only on Home; the desktop's New is in the sidebar on every page.
const profiles: Record<
	string,
	{ use: BrowserContextOptions; open: 'sidebar' | 'plus'; start: string }
> = {
	phone: {
		use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
		open: 'plus',
		start: '/home'
	},
	desktop: { use: { viewport: { width: 1280, height: 800 } }, open: 'sidebar', start: '/' }
};

async function signIn(browser: Browser, use: BrowserContextOptions) {
	const context = await browser.newContext({ baseURL, ...use });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	return context.newPage();
}

for (const [profile, { use, open, start }] of Object.entries(profiles)) {
	test.describe(profile, () => {
		test(`${open === 'plus' ? 'the +' : 'New'} asks first: two rows, the first lit, New thread opens the post dialog`, async ({
			browser
		}) => {
			const page = await signIn(browser, use);
			await page.goto(start, { waitUntil: 'networkidle' });
			await page.getByRole('button', { name }).filter({ visible: true }).click();
			const post = page.getByRole('menuitem', { name: /^New thread/ });
			const doc = page.getByRole('menuitem', { name: /^New document/ });
			await expect(post).toHaveAttribute('data-highlighted', '');
			await expect(doc).toBeVisible();
			await expect(page.getByRole('menu').locator('.handle')).toBeAttached();
			const menu = (await page.getByRole('menu').boundingBox())!;
			// 316 at a 16px root: a product of rems, so it can come out a fraction short.
			if (profile === 'desktop') expect(Math.abs(menu.width - 316)).toBeLessThan(1);
			else expect(menu.width).toBe(390);
			await page.keyboard.press('Escape');
			await expect(page.getByRole('menu')).toHaveCount(0);

			await page.getByRole('button', { name }).filter({ visible: true }).click();
			await post.click();
			await expect(page.getByRole('dialog', { name: 'New thread' })).toBeVisible();
			await page.context().close();
		});

		test('New document lands on a new doc with the title focused', async ({ browser }) => {
			const page = await signIn(browser, use);
			await page.goto(start, { waitUntil: 'networkidle' });
			await page.getByRole('button', { name }).filter({ visible: true }).click();
			await page.getByRole('menuitem', { name: /^New document/ }).click();
			await expect(page).toHaveURL('/notes/new');
			await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused();
			await page.context().close();
		});

		test('c opens the same menu, over a page that has no New of its own', async ({ browser }) => {
			const page = await signIn(browser, use);
			await page.goto(start, { waitUntil: 'networkidle' });
			await page.keyboard.press('c');
			await expect(page.getByRole('menuitem', { name: /^New thread/ })).toBeVisible();
			await expect(page.getByRole('menuitem', { name: /^New document/ })).toBeVisible();
			await page.context().close();
		});

		test('the feed’s composer and the Docs bar’s New doc open no menu', async ({ browser }) => {
			const page = await signIn(browser, use);
			await page.goto('/notes', { waitUntil: 'networkidle' });
			await page.getByRole('link', { name: 'New doc' }).first().click();
			await expect(page).toHaveURL('/notes/new');
			await expect(page.getByRole('menu')).toHaveCount(0);
			await page.goto(`/projects/${project.id}`, { waitUntil: 'networkidle' });
			await page.getByRole('link', { name: 'What do you want to share?' }).click();
			await expect(page.getByRole('dialog', { name: 'New thread' })).toBeVisible();
			await expect(page.getByRole('menu')).toHaveCount(0);
			await page.context().close();
		});
	});
}
