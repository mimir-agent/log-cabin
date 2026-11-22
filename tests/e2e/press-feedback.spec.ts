// Press feedback: a control held down shows its pressed state at once, and taps on controls
// never wait for a double-tap-zoom check.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { baseURL, people, post } from './fixtures.ts';

async function signIn(browser: Browser, viewport: { width: number; height: number }) {
	const context = await browser.newContext({ baseURL, viewport });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	return context.newPage();
}

/** The style of `selector` at rest, then while the mouse is held on it, then released off it. */
async function press(page: Page, selector: string, property: string) {
	const control = page.locator(selector).filter({ visible: true }).first();
	await expect(control).toBeVisible();
	// The value and data-state come from one evaluate, so a menu mounting can't fall between them.
	const read = () =>
		control.evaluate(
			(el, p) => ({
				value: getComputedStyle(el).getPropertyValue(p),
				open: el.getAttribute('data-state') === 'open'
			}),
			property
		);
	const box = (await control.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	const { value: hovered } = await read();
	await page.mouse.down();
	await page.evaluate(() => new Promise(requestAnimationFrame));
	const { value: held, open } = await read();
	// Slide off before letting go, so the press doesn't follow the link.
	await page.mouse.move(1, 1);
	await page.mouse.up();
	const touchAction = await control.evaluate((el) => getComputedStyle(el).touchAction);
	return { hovered, held, open, touchAction };
}

/** What `var(--hue-pressed)` (or another fill variable) computes to on this page. */
const pressedFill = (page: Page, variable = '--hue-pressed') =>
	page.evaluate((v) => {
		const probe = document.body.appendChild(document.createElement('div'));
		probe.style.backgroundColor = `var(${v})`;
		const value = getComputedStyle(probe).backgroundColor;
		probe.remove();
		return value;
	}, variable);

// Not New or the account button: their menus open on pointerdown, so `:active` ends while the
// pointer is still down. They have their own test below.
const fills = [
	{ name: 'a sidebar link', path: '/', selector: 'a.link[href="/inbox"]' },
	{ name: 'an icon button', path: '/chat', selector: 'a.icon-button[href="/chat/new"]' },
	{ name: 'a view tab', path: '/inbox', selector: 'a.view[href="/inbox?tab=read"]' },
	{ name: 'a list row', path: '/projects', selector: 'a.row' },
	{ name: 'a chat thread row', path: '/chat', selector: 'a.row' },
	{ name: 'a sidebar group toggle', path: '/', selector: 'button.toggle' },
	{ name: 'the composer row on Home', path: '/', selector: 'a.composer' },
	{ name: 'the add reaction button', path: `/posts/${post.id}`, selector: 'button.add' }
];

for (const { name, path, selector } of fills) {
	test(`holding ${name} shows the pressed fill at once`, async ({ browser }) => {
		const page = await signIn(browser, { width: 1280, height: 800 });
		await page.goto(path);
		const { held, touchAction } = await press(page, selector, 'background-color');
		expect(held, `${selector} on ${path}: background while held`).toBe(await pressedFill(page));
		expect(touchAction, `${selector} on ${path}: touch-action`).toBe('manipulation');
		await page.context().close();
	});
}

test('holding the account button shows the pressed fill, or the open fill once its menu opens', async ({
	browser
}) => {
	const page = await signIn(browser, { width: 1280, height: 800 });
	await page.goto('/');
	const { held, open, touchAction } = await press(page, 'button.me', 'background-color');
	const expected = await pressedFill(page, open ? '--hue-fill' : '--hue-pressed');
	expect(held, `button.me: background while held, menu ${open ? 'open' : 'closed'}`).toBe(expected);
	expect(touchAction, 'button.me: touch-action').toBe('manipulation');
	await page.context().close();
});

test('holding a tab in the phone tab bar shows the pressed fill at once', async ({ browser }) => {
	const page = await signIn(browser, { width: 390, height: 844 });
	await page.goto('/');
	const { held, touchAction } = await press(page, 'a.tab[href="/inbox"]', 'background-color');
	expect(held, 'tab bar Inbox: background while held').toBe(await pressedFill(page));
	expect(touchAction, 'tab bar Inbox: touch-action').toBe('manipulation');
	const org = await press(page, 'button.org', 'background-color');
	expect(org.held, 'the org mark that opens the drawer: background while held').toBe(
		await pressedFill(page)
	);
	await page.context().close();
});

test('holding a button gives it a small give, and the main button too', async ({ browser }) => {
	const page = await signIn(browser, { width: 1280, height: 800 });
	const scaled = 'matrix(0.98, 0, 0, 0.98, 0, 0)';
	const givesWhenHeld = async (path: string, selector: string) => {
		const { hovered, held, touchAction } = await press(page, selector, 'transform');
		expect(hovered, `${selector} on ${path}: transform at rest`).toBe('none');
		expect(held, `${selector} on ${path}: transform while held`).toBe(scaled);
		expect(touchAction, `${selector} on ${path}: touch-action`).toBe('manipulation');
	};
	await page.goto('/settings/profile');
	await givesWhenHeld('/settings/profile', 'button.button');
	// Comment waits for something to send, so it gets some first.
	await page.goto(`/posts/${post.id}`, { waitUntil: 'networkidle' });
	await page.locator('.composer').getByRole('textbox').fill('Held down');
	await givesWhenHeld(`/posts/${post.id}`, '.composer button.suede-button');
	await page.context().close();
});
