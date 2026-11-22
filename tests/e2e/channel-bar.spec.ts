// A channel's bar on a phone is back, the name with its marks (a lock, Archived), call and "…",
// on both tabs, with
// the name on the screen's centre line. The star is the first item of "…". Against the built
// Worker (serve.ts).
import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { posts } from '../../src/lib/strings/posts.ts';
import { baseURL, cave, people, project, yard } from './fixtures.ts';

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13'];

async function open(browser: Browser, path: string, phone = true) {
	const context = await browser.newContext({
		baseURL,
		...(phone
			? { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch }
			: { viewport: { width: 1280, height: 800 } })
	});
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(path, { waitUntil: 'networkidle' });
	return page;
}

const bar = (page: Page) => page.locator('header.page-header:visible');
const middle = (page: Page) => bar(page).locator('.text');
// The lock is its icon: its text is only for screen readers.
const lock = (page: Page) => middle(page).locator('.marks svg');

async function centreOf(box: ReturnType<Page['locator']>) {
	const b = (await box.boundingBox())!;
	return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('the name is centred on the screen and on the icons’ line', async ({ browser }) => {
	// Trail is open: its name has no marks, so the name itself is the centred thing.
	const page = await open(browser, `/projects/${project.id}`);
	const name = await centreOf(bar(page).locator('h1'));
	expect(Math.abs(name.x - 195)).toBeLessThan(1);
	expect(Math.abs(name.y - 28)).toBeLessThan(1);
	for (const button of await bar(page).getByRole('button').all()) {
		const box = (await button.boundingBox())!;
		expect([box.width, box.height]).toEqual([44, 44]);
	}
	const back = (await bar(page).getByRole('link', { name: 'Back' }).boundingBox())!;
	expect(back.x).toBe(6);
	const more = (await bar(page).getByRole('button', { name: 'More actions' }).boundingBox())!;
	expect(more.x + more.width).toBe(390 - 6);
	await page.context().close();
});

test('a long name stays on one line, centred, at 320px', async ({ browser }) => {
	const page = await open(browser, `/projects/${project.id}`);
	await page.setViewportSize({ width: 320, height: 640 });
	const name = bar(page).locator('h1');
	const long = 'Quarterly planning and roadmap review for the whole design organisation';
	await name.evaluate((h1, text) => (h1.textContent = text), long);
	const box = (await name.boundingBox())!;
	expect(box.height).toBeLessThan(24);
	expect(await name.evaluate((h1) => h1.scrollWidth > h1.clientWidth)).toBe(true);
	expect(Math.abs(box.x + box.width / 2 - 160)).toBeLessThan(1);
	await page.context().close();
});

test('the posts tab: back to Projects, no org mark, tile or star, the tab bar stays', async ({
	browser
}) => {
	const page = await open(browser, `/projects/${cave.id}`);
	await expect(bar(page).getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/projects');
	await expect(bar(page).getByRole('button', { name: 'Open navigation' })).toHaveCount(0);
	await expect(bar(page).locator('.mark')).toBeHidden();
	await expect(bar(page).locator('form.star')).toBeHidden();
	const text = await centreOf(middle(page));
	expect(Math.abs(text.x - 195), 'name and lock are centred together').toBeLessThan(1);
	await expect(lock(page)).toBeVisible();
	await expect(page.locator('.tabs')).toBeVisible();
	await page.context().close();
});

test('the posts tab’s menu opens with the star, and it works', async ({ browser }) => {
	const page = await open(browser, `/projects/${cave.id}`);
	const more = bar(page).getByRole('button', { name: 'More actions' });
	await more.click();
	await expect(page.getByRole('menuitem').first()).toHaveText(posts.projects.favorite);
	await page.getByRole('menuitem').first().click();
	await expect(page.getByRole('menu')).toHaveCount(0);

	await more.click();
	await expect(page.getByRole('menuitem').first()).toHaveText(posts.projects.unfavorite);
	// Put it back, so the next test starts as this one did.
	await page.getByRole('menuitem').first().click();
	await page.context().close();
});

test('the chat tab of a channel has the same bar, and no tab bar', async ({ browser }) => {
	const page = await open(browser, `/chat/${cave.chatId}`);
	await expect(bar(page).getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/projects');
	await expect(bar(page).locator('.middle > :not(.text)')).toBeHidden();
	await expect(bar(page).locator('.description')).toBeHidden();
	const text = await centreOf(middle(page));
	expect(Math.abs(text.x - 195)).toBeLessThan(1);
	expect(Math.abs(text.y - 28)).toBeLessThan(1);
	await expect(lock(page)).toBeVisible();
	await expect(page.locator('.tabs')).toBeHidden();
	await page.context().close();
});

test('an archived channel shows Archived after its name on both tabs', async ({ browser }) => {
	for (const path of [`/projects/${yard.id}`, `/chat/${yard.chatId}`]) {
		const page = await open(browser, path);
		await expect(
			middle(page).locator('.marks').getByText(posts.projects.archivedBadge)
		).toBeVisible();
		const text = await centreOf(middle(page));
		expect(Math.abs(text.x - 195)).toBeLessThan(1);
		await page.context().close();
	}
});

test('in landscape the shell’s side inset is counted once, not again by the bar', async ({
	browser
}) => {
	const page = await open(browser, `/projects/${project.id}`);
	await page.setViewportSize({ width: 844, height: 390 });
	const phone = await page.context().newCDPSession(page);
	await phone.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 47, right: 47 } });
	const back = (await bar(page).getByRole('link', { name: 'Back' }).boundingBox())!;
	expect(back.x).toBe(47 + 6);
	const more = (await bar(page).getByRole('button', { name: 'More actions' }).boundingBox())!;
	expect(more.x + more.width).toBe(844 - 47 - 6);
	await page.context().close();
});

test('on a desktop the star stays beside the name and out of the menu', async ({ browser }) => {
	const page = await open(browser, `/projects/${cave.id}`, false);
	await expect(bar(page).locator('form.star')).toBeVisible();
	await expect(bar(page).locator('.marks')).toBeHidden();
	await bar(page).getByRole('button', { name: 'More actions' }).click();
	await expect(page.getByRole('menuitem', { name: posts.projects.favorite })).toHaveCount(0);
	await page.context().close();
});
