// iOS Safari zooms the page into any focused field whose text is under 16px. On touch screens
// and narrow windows every field and editor is at least 16px; on a desktop each keeps its size.
import {
	devices,
	expect,
	test,
	type BrowserContextOptions,
	type Locator,
	type Page
} from '@playwright/test';
import { baseURL, notes, people, project, threads, type Person } from './fixtures.ts';

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13'];
const profiles: Record<string, { use: BrowserContextOptions; coarse: boolean }> = {
	iPhone: { use: { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch }, coarse: true },
	'390px, fine pointer': { use: { viewport: { width: 390, height: 844 } }, coarse: false },
	desktop: { use: { viewport: { width: 1280, height: 800 } }, coarse: false }
};

const editor = (page: Page, within: string) => page.locator(`${within} .ProseMirror`);

/** Each field, who opens it where, and its size in px on a desktop: 14 for interface text
 *  (--type-body), 15 for prose (--type-prose). */
const fields: {
	name: string;
	who: Person | null;
	path: string;
	field: (page: Page) => Promise<Locator> | Locator;
	desktop: number;
}[] = [
	{
		name: 'post composer title',
		who: 'ada',
		path: `/projects/${project.id}/new`,
		field: (page) => page.locator('.composer-card .subject input'),
		desktop: 15
	},
	{
		name: 'post composer body',
		who: 'ada',
		path: `/projects/${project.id}/new`,
		field: (page) => editor(page, '.composer-card'),
		desktop: 15
	},
	{
		name: 'comment box',
		who: 'ada',
		path: `/notes/${notes.trip.id}`,
		field: (page) => editor(page, '#comments'),
		desktop: 14
	},
	{
		name: 'chat composer',
		who: 'ada',
		path: `/chat/${threads.bo.id}`,
		field: (page) => editor(page, '.composer'),
		desktop: 14
	},
	{
		name: 'search field',
		who: 'ada',
		path: '/search',
		field: (page) => page.locator('#search-q'),
		desktop: 16 // the search page's one field is set large on purpose
	},
	{
		name: 'Cmd-K input',
		who: 'ada',
		path: '/',
		field: async (page) => {
			const input = page.locator('.switcher .input');
			// The shortcut does nothing until the page has hydrated, so press until it opens. It
			// toggles, so a retry presses again only while the switcher is still closed.
			await expect(async () => {
				if (!(await input.isVisible())) await page.keyboard.press('Control+k');
				await expect(input).toBeVisible({ timeout: 1000 });
			}).toPass();
			return input;
		},
		desktop: 15 // Campsite's command menu field is 15px
	},
	{
		name: 'login email',
		who: null,
		path: '/login',
		field: (page) => page.locator('input[name="email"]'),
		desktop: 14
	},
	{
		name: 'profile name',
		who: 'ada',
		path: '/settings/profile',
		field: (page) => page.locator('input[name="name"]'),
		desktop: 14
	},
	{
		name: 'org name',
		who: 'eve',
		path: '/settings/org',
		field: (page) => page.locator('input[name="name"]'),
		desktop: 14
	},
	{
		name: 'org email domain',
		who: 'eve',
		path: '/settings/org',
		field: (page) => page.locator('input[name="domain"]'),
		desktop: 14
	},
	{
		name: 'note editor',
		who: 'ada',
		path: `/notes/${notes.trip.id}`,
		field: async (page) => {
			await expect(page.getByRole('status').filter({ hasText: 'Connected' })).toBeVisible();
			return page.getByRole('textbox', { name: /^Write something/ });
		},
		desktop: 15
	}
];

for (const [profile, { use, coarse }] of Object.entries(profiles)) {
	test.describe(profile, () => {
		test.use(use);

		test('the viewport still lets people zoom', async ({ page }) => {
			await page.goto('/login');
			await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
				'content',
				'width=device-width, initial-scale=1'
			);
			expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(coarse);
		});

		for (const { name, who, path, field, desktop } of fields) {
			test(name, async ({ context, page }) => {
				if (who) {
					await context.addCookies([
						{ name: 'campfire_session', value: people[who].token, url: baseURL }
					]);
				}
				await page.goto(path);
				const input = await field(page);
				await input.click();
				await expect(input).toBeFocused();
				const size = await input.evaluate((element) =>
					parseFloat(getComputedStyle(element).fontSize)
				);
				if (profile === 'desktop') expect(size).toBe(desktop);
				else expect(size).toBeGreaterThanOrEqual(16);
			});
		}

		test('a mention in the post composer is the size of the text around it', async ({
			context,
			page
		}) => {
			await context.addCookies([
				{ name: 'campfire_session', value: people.ada.token, url: baseURL }
			]);
			await page.goto(`/projects/${project.id}/new`);
			const body = editor(page, '.composer-card');
			await body.click();
			await page.keyboard.type('Hi @B');
			await expect(page.getByRole('listbox')).toBeVisible();
			await page.keyboard.press('Enter');
			const mention = body.locator('.mention');
			await expect(mention).toHaveAttribute('contenteditable', 'false');
			const size = (element: Element) => getComputedStyle(element).fontSize;
			expect(await mention.evaluate(size)).toBe(await body.evaluate(size));
		});
	});
}
