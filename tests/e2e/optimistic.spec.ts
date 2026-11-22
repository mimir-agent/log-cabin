// Actions answer in the frame they're taken, before the server does, and a refused or lost
// request puts things back with a toast. Every test holds the request in the browser, checks
// the page while it's held, then fails it or lets it through.
import {
	devices,
	expect,
	test,
	type Browser,
	type BrowserContextOptions,
	type Locator,
	type Page
} from '@playwright/test';
import { chat } from '../../src/lib/strings/chat.ts';
import { core } from '../../src/lib/strings/core.ts';
import { shell } from '../../src/lib/strings/shell.ts';
import { baseURL, notes, people, post, project, threads } from './fixtures.ts';
import { unreadFixture } from './database.ts';

async function signIn(
	browser: Browser,
	options: BrowserContextOptions = { viewport: { width: 1280, height: 800 } }
) {
	const context = await browser.newContext({ ...options, baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	return context.newPage();
}

/**
 * Holds every request `matches` lets through until the returned function says how it ends:
 * `fail` drops the connection, `pass` sends it on. Later requests go straight through.
 */
async function hold(page: Page, matches: (url: URL, method: string) => boolean) {
	let release: (outcome: 'fail' | 'pass') => void = () => {};
	const outcome = new Promise<'fail' | 'pass'>((resolve) => (release = resolve));
	let held = false;
	await page.route('**/*', async (route) => {
		const request = route.request();
		if (held || !matches(new URL(request.url()), request.method())) return route.fallback();
		held = true;
		if ((await outcome) === 'fail') await route.abort('failed');
		else await route.continue();
	});
	return release;
}

/**
 * Lets the next request `matches` lets through reach the server at once, but holds the answer
 * until the returned function says how it ends: `lose` drops it, `pass` delivers it.
 */
async function holdAnswer(page: Page, matches: (url: URL, method: string) => boolean) {
	let release: (outcome: 'lose' | 'pass') => void = () => {};
	const outcome = new Promise<'lose' | 'pass'>((resolve) => (release = resolve));
	let held = false;
	await page.route('**/*', async (route) => {
		const request = route.request();
		if (held || !matches(new URL(request.url()), request.method())) return route.fallback();
		held = true;
		const response = await route.fetch();
		if ((await outcome) === 'lose') await route.abort('failed');
		else await route.fulfill({ response });
	});
	return release;
}
const action = (name: string) => (url: URL, method: string) =>
	method === 'POST' && url.search === `?/${name}`;

/** The most elements matching `selector` with `text` seen in any frame over `ms`. */
const mostAtOnce = (page: Page, selector: string, text: string, ms: number) =>
	page.evaluate(
		([selector, text, ms]) =>
			new Promise<number>((resolve) => {
				let most = 0;
				const start = performance.now();
				const frame = () => {
					const count = [...document.querySelectorAll(selector)].filter((el) =>
						el.textContent?.includes(text)
					).length;
					most = Math.max(most, count);
					if (performance.now() - start < ms) requestAnimationFrame(frame);
					else resolve(most);
				};
				frame();
			}),
		[selector, text, ms] as const
	);

const toast = (page: Page) => page.getByRole('status').filter({ hasText: core.errors.notSaved });

test('a reaction shows before the server answers, and goes back when it fails', async ({
	browser
}) => {
	const page = await signIn(browser);
	await page.goto(`/posts/${post.id}`);
	const thumbs = page.locator('button.pill', { hasText: '👍' });
	await expect(thumbs).toHaveAttribute('aria-pressed', 'false');
	await expect(thumbs.locator('.count')).toHaveText('1');

	const release = await hold(page, action('react'));
	await thumbs.click();
	await expect(thumbs, 'joined while the request is held').toHaveAttribute('aria-pressed', 'true');
	await expect(thumbs.locator('.count')).toHaveText('2');
	release('fail');
	await expect(thumbs, 'back as it was after the failure').toHaveAttribute('aria-pressed', 'false');
	await expect(thumbs.locator('.count')).toHaveText('1');
	await expect(toast(page)).toBeVisible();

	const add = await hold(page, action('react'));
	await page.locator('button.add').first().click();
	await page.locator('button.cell', { hasText: '🎉' }).first().click();
	const party = page.locator('button.pill', { hasText: '🎉' });
	await expect(party, 'a new pill while the request is held').toHaveAttribute(
		'aria-pressed',
		'true'
	);
	add('fail');
	await expect(party, 'gone again after the failure').toHaveCount(0);
	await page.context().close();
});

test('a reaction that saves stays, and the server agrees after a reload', async ({ browser }) => {
	const page = await signIn(browser);
	await page.goto(`/posts/${post.id}`);
	const thumbs = page.locator('button.pill', { hasText: '👍' });
	const release = await hold(page, action('react'));
	await thumbs.click();
	await expect(thumbs).toHaveAttribute('aria-pressed', 'true');
	const saved = page.waitForResponse((r) => r.url().endsWith('?/react'));
	release('pass');
	await saved;
	await expect(thumbs.locator('.count')).toHaveText('2');
	await page.reload();
	await expect(thumbs).toHaveAttribute('aria-pressed', 'true');
	await expect(thumbs.locator('.count')).toHaveText('2');
	// Put it back for the tests after this one.
	await thumbs.click();
	await expect(thumbs.locator('.count')).toHaveText('1');
	await page.waitForLoadState('networkidle');
	await page.context().close();
});

test('a chat message shows the moment it is sent, survives a failure, and shows once when it goes through', async ({
	browser
}) => {
	const page = await signIn(browser);
	await page.goto(`/chat/${threads.bo.id}`);
	const text = 'Bringing the stove';
	const composer = page.locator(`[aria-label="${chat.thread.placeholder}"]`);
	await composer.click();
	await page.keyboard.type(text);

	const release = await hold(page, action('send'));
	await page.locator('button.send').click();
	const sent = page.locator('.message', { hasText: text });
	await expect(sent, 'in the thread while the request is held').toBeVisible();
	await expect(composer, 'composer cleared at once').not.toContainText(text);
	await expect(page.locator(`a.row[href="/chat/${threads.bo.id}"]`)).toContainText(text);
	release('fail');
	await expect(sent.getByRole('alert')).toContainText(chat.thread.notSent);

	await sent.getByRole('button', { name: chat.thread.retry }).click();
	// The server's copy, and the socket's echo of it, replace the one shown: never two.
	expect(await mostAtOnce(page, '.message', text, 3000), 'copies of the message at once').toBe(1);
	await expect(sent.getByRole('alert')).toHaveCount(0);
	await page.reload();
	await expect(page.locator('.message', { hasText: text })).toHaveCount(1);
	await page.context().close();
});

test('a chat message that saved but lost its answer shows once, and is stored once', async ({
	browser
}) => {
	const page = await signIn(browser);
	await page.goto(`/chat/${threads.bo.id}`);
	const text = 'Saved, answer lost';
	await page.locator(`[aria-label="${chat.thread.placeholder}"]`).click();
	await page.keyboard.type(text);

	const release = await holdAnswer(page, action('send'));
	await page.locator('button.send').click();
	const copies = mostAtOnce(page, '.message', text, 3000);
	// The socket's echo of the stored message is on its way while the answer is lost.
	await page.waitForTimeout(500);
	release('lose');
	expect(await copies, 'copies of the message at once').toBe(1);
	const sent = page.locator('.message', { hasText: text });
	await expect(sent.getByRole('alert'), 'shown as sent: the server has it').toHaveCount(0);
	await page.reload();
	await expect(sent, 'stored once').toHaveCount(1);
	await page.context().close();
});

test('a chat message whose echo comes before the answer shows once', async ({ browser }) => {
	const page = await signIn(browser);
	await page.goto(`/chat/${threads.bo.id}`);
	const text = 'Echo before answer';
	await page.locator(`[aria-label="${chat.thread.placeholder}"]`).click();
	await page.keyboard.type(text);

	const release = await holdAnswer(page, action('send'));
	await page.locator('button.send').click();
	expect(await mostAtOnce(page, '.message', text, 1500), 'copies while the answer waits').toBe(1);
	release('pass');
	expect(await mostAtOnce(page, '.message', text, 1000), 'copies after the answer').toBe(1);
	await page.context().close();
});

test('a comment that saved but lost its answer shows once, and stays out of the box', async ({
	browser
}) => {
	const page = await signIn(browser);
	await page.goto(`/posts/${post.id}`);
	const text = 'Saved, answer lost, comment';
	const box = page.locator('[aria-label="Write a comment…"]');
	await box.click();
	await page.keyboard.type(text);

	const release = await holdAnswer(page, action('comment'));
	await page.locator('button.suede-button', { hasText: 'Comment' }).click();
	const copies = mostAtOnce(page, '.comment, .sent', text, 3000);
	await page.waitForTimeout(500);
	release('lose');
	expect(await copies, 'copies of the comment at once').toBe(1);
	await expect(box, 'not put back in the box: it saved').not.toContainText(text);
	await expect(toast(page)).toHaveCount(0);
	await page.reload();
	await expect(page.locator('.comment', { hasText: text }), 'stored once').toHaveCount(1);
	await page.context().close();
});

test('a comment shows the moment it is sent, and comes back into the box when it fails', async ({
	browser
}) => {
	const page = await signIn(browser);
	await page.goto(`/posts/${post.id}`);
	const text = 'I have a spare tarp';
	const box = page.locator('[aria-label="Write a comment…"]');
	await box.click();
	await page.keyboard.type(text);

	const release = await hold(page, action('comment'));
	await page.locator('button.suede-button', { hasText: 'Comment' }).click();
	await expect(page.locator('.sent', { hasText: text }), 'shown while held').toBeVisible();
	await expect(box).not.toContainText(text);
	release('fail');
	await expect(page.locator('.sent')).toHaveCount(0);
	const restored = page.locator('[aria-label="Write a comment…"]');
	await expect(restored, 'the text is back in the box').toContainText(text);
	await expect(toast(page)).toBeVisible();

	await page.locator('button.suede-button', { hasText: 'Comment' }).click();
	await expect(page.locator('.comment', { hasText: text })).toHaveCount(1);
	await expect(page.locator('.sent')).toHaveCount(0);
	await page.context().close();
});

test('a project star turns at once, and back when it fails', async ({ browser }) => {
	const page = await signIn(browser);
	await page.goto(`/projects/${project.id}`);
	const star = page.locator('form.star button');
	await expect(star).toHaveAttribute('aria-pressed', 'false');
	const release = await hold(page, action('favorite'));
	await star.click();
	await expect(star, 'starred while held').toHaveAttribute('aria-pressed', 'true');
	release('fail');
	await expect(star).toHaveAttribute('aria-pressed', 'false');
	await expect(toast(page)).toBeVisible();
	await page.context().close();
});

test('an inbox item leaves the list at once when marked read, and comes back when it fails', async ({
	browser
}) => {
	unreadFixture();
	const page = await signIn(browser);
	await page.goto('/inbox');
	const row = page.locator('li.row', { hasText: post.title });
	await expect(row).toBeVisible();
	const release = await hold(page, action('read'));
	await row.hover();
	await row.getByRole('button', { name: 'Mark read' }).click();
	await expect(row, 'gone while held').toHaveCount(0);
	release('fail');
	await expect(row, 'back after the failure').toBeVisible();
	await expect(toast(page)).toBeVisible();
	await page.context().close();
});

test('a failed post keeps the page and the draft, and Post is held while it waits', async ({
	browser
}) => {
	const page = await signIn(browser);
	await page.goto(`/projects/${project.id}/new`);
	// The editor mounts once the page has hydrated. A title filled before then is cleared.
	await expect(page.locator('.ProseMirror')).toBeVisible();
	await page.locator('[name=title]').fill('Food plan');
	await page.locator('.ProseMirror').click();
	await page.keyboard.type('Who cooks on day two?');
	const submit = page.locator('button[type=submit]', { hasText: 'Post' });
	const release = await hold(
		page,
		(url, method) => method === 'POST' && url.pathname.endsWith('/new')
	);
	await submit.click();
	await expect(submit, 'held while the post is on its way').toBeDisabled();
	await expect(submit).toHaveAttribute('aria-busy', 'true');
	release('fail');
	await expect(toast(page)).toBeVisible();
	await expect(submit).toBeEnabled();
	await expect(page.locator('[name=title]')).toHaveValue('Food plan');
	await page.context().close();
});

test('the tapped page is selected before it has loaded, and a line shows if it takes a while', async ({
	browser
}) => {
	const page = await signIn(browser);
	await page.goto('/');
	const release = await hold(page, (url) => url.pathname === '/inbox/__data.json');
	await page.locator('a.link[href="/inbox"]').click();
	await expect(page.locator('a.link[href="/inbox"]')).toHaveAttribute('aria-current', 'page');
	await expect(page.locator('main .progress')).toHaveCSS('opacity', '1');
	release('pass');
	await expect(page).toHaveURL('/inbox');
	await expect(page.locator('main .progress')).toHaveCount(0);
	await page.context().close();
});

test('the quick switcher matches your projects while the search is still out', async ({
	browser
}) => {
	const page = await signIn(browser);
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.keyboard.press('Control+k');
	const input = page.getByPlaceholder('Jump to a channel, person or page…');
	await expect(input).toBeFocused();
	await hold(page, (url) => url.pathname === '/search/quick' && url.searchParams.get('q') !== '');
	await page.keyboard.type('Tra');
	await expect(page.locator('[data-dialog-content]')).toContainText(project.name);
	await page.context().close();
});

test('the quick switcher finds people and recent items with no answer from the server', async ({
	browser
}) => {
	const page = await signIn(browser);
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const asked: string[] = [];
	await page.route(
		(url) => url.pathname === '/search/quick',
		(route) => {
			asked.push(new URL(route.request().url()).searchParams.get('q') ?? '');
			// Never answered: everything below comes from the page itself.
		}
	);
	const row = (name: string) => page.getByRole('option', { name, exact: true });

	// Typed the moment it opens, before anything could have come back.
	await page.keyboard.press('Control+k');
	await page.keyboard.type('Gea');
	await expect(row(post.title), 'a recent post').toBeVisible();

	await page.keyboard.press('Control+a');
	await page.keyboard.type(people.bo.name);
	await expect(row(people.bo.name), 'a person').toBeVisible();
	expect(asked, 'the empty box asks nothing').not.toContain('');
	await page.context().close();
});

/** Fails one 🎉 reaction added from `add`, which puts up the toast. */
async function failReaction(page: Page, add: Locator) {
	const release = await hold(page, action('react'));
	await add.click();
	await page.locator('button.cell', { hasText: '🎉' }).first().click();
	release('fail');
	await expect(toast(page)).toBeVisible();
}

test('on a wide screen a failure toast sits at the top', async ({ browser }) => {
	const page = await signIn(browser);
	await page.goto(`/posts/${post.id}`);
	await page.waitForLoadState('networkidle');
	await failReaction(page, page.locator('button.add').first());
	const box = (await toast(page).locator('.toast').boundingBox())!;
	expect(box.y, 'at the top').toBeLessThan(800 / 2);
	await page.context().close();
});

const iPhone = devices['iPhone 13'];

for (const [name, path, add] of [
	['post', `/posts/${post.id}`, (page: Page) => page.locator('button.add').first()],
	['note', `/notes/${notes.trip.id}`, (page: Page) => page.locator('button.add').first()],
	[
		'conversation',
		`/chat/${threads.bo.id}`,
		async (page: Page) => {
			// On a touch screen a message's actions stay clipped; a long press opens its menu, whose
			// last button adds a reaction. The press is near the top of the screen so the finger
			// lifts clear of the menu below it.
			const bubble = page.locator('.message .bubble').first();
			await bubble.scrollIntoViewIfNeeded();
			const top = (await bubble.boundingBox())!.y;
			await page.evaluate((distance) => scrollBy(0, distance), top - 150);
			await page.waitForTimeout(300);
			const box = (await bubble.boundingBox())!;
			const touch = await page.context().newCDPSession(page);
			const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
			await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
			await page.waitForTimeout(700);
			await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
			return page.getByRole('menu').getByRole('button', { name: 'Add reaction' });
		}
	]
] as const) {
	test(`on a phone a failure toast on a ${name} stays clear of Back, the composer and the tab bar`, async ({
		browser
	}) => {
		const page = await signIn(browser, iPhone);
		await page.goto(path);
		await page.waitForLoadState('networkidle');
		await failReaction(page, await add(page));

		// Every frame the toast shows, which of the others its box overlaps, and where a tap on
		// Back's centre lands.
		const seen = await page.evaluate(
			([back]) =>
				new Promise<{ frames: number; overlaps: string[]; backTaps: string[] }>((resolve) => {
					const others = {
						back: `a[aria-label="${back}"]`,
						composer: '.composer, .composer-bar, .comment-form',
						tabs: 'nav.tabs'
					};
					const overlap = (a: DOMRect, b: DOMRect) =>
						a.width > 0 &&
						b.width > 0 &&
						a.left < b.right &&
						b.left < a.right &&
						a.top < b.bottom &&
						b.top < a.bottom;
					const out = { frames: 0, overlaps: new Set<string>(), backTaps: new Set<string>() };
					const frame = () => {
						const shown = document.querySelector('.toasts .toast');
						if (!shown) {
							return resolve({
								frames: out.frames,
								overlaps: [...out.overlaps],
								backTaps: [...out.backTaps]
							});
						}
						out.frames++;
						const box = shown.getBoundingClientRect();
						for (const [what, selector] of Object.entries(others)) {
							for (const el of document.querySelectorAll(selector)) {
								if (overlap(box, el.getBoundingClientRect())) out.overlaps.add(what);
							}
						}
						const at = document.querySelector(others.back)!.getBoundingClientRect();
						const hit = document.elementFromPoint(at.x + at.width / 2, at.y + at.height / 2);
						out.backTaps.add(
							hit?.closest('a')?.getAttribute('aria-label') ?? String(hit?.className)
						);
						requestAnimationFrame(frame);
					};
					frame();
				}),
			[shell.back] as const
		);
		expect(seen.frames, 'sampled while it showed').toBeGreaterThan(60);
		expect(seen.overlaps, 'overlapped while it showed').toEqual([]);
		expect(seen.backTaps, 'a tap on Back reaches Back').toEqual([shell.back]);
		await page.context().close();
	});
}
