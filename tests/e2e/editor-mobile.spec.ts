// A phone's editors keep their tools and footer actions in reach while typing. The keyboard is
// approximated with iPhone 13 emulation and the viewport cut to the height an
// iOS keyboard leaves (664 - 336 = 328 px). Against the built Worker (serve.ts).
import {
	devices,
	expect,
	test,
	type Browser,
	type BrowserContextOptions,
	type Locator,
	type Page
} from '@playwright/test';
import { editor } from '../../src/lib/strings/editor.ts';
import { notes as noteText } from '../../src/lib/strings/notes.ts';
import { posts as postText } from '../../src/lib/strings/posts.ts';
import { liveContext } from './editor.ts';
import { baseURL, notes, people, post, posts, project, threads, type Person } from './fixtures.ts';

const iPhone = devices['iPhone 13'];
const iPad = devices['iPad Pro 11'];
const keyboardUp = { ...iPhone, viewport: { width: 390, height: 328 } };
const desktop = { viewport: { width: 1280, height: 800 } };

/** Ada (or `who`), signed in on a screen like `use`, at `path`. */
async function open(
	browser: Browser,
	use: BrowserContextOptions,
	path: string,
	who: Person = 'ada'
) {
	const context = await browser.newContext({ ...liveContext, ...use, baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(path, { waitUntil: 'networkidle' });
	return page;
}

const box = (page: Page, label: RegExp) => page.getByRole('textbox', { name: label });
const bodyBox = (page: Page) => box(page, /^Write something/);

async function type(page: Page, body: Locator, lines: number, key = 'Enter') {
	await body.tap();
	for (let i = 0; i < lines; i++) {
		await page.keyboard.type(`line ${i}`);
		await page.keyboard.press(key);
	}
}

/** Selects the last `count` characters before the caret. */
async function selectBack(page: Page, count: number) {
	for (let i = 0; i < count; i++) await page.keyboard.press('Shift+ArrowLeft');
}

/** Whether a pointer at the centre of `target` reaches it, and all of it is on screen. */
const reachable = (target: Locator) =>
	target.evaluate((element) => {
		const { left, top, width, height } = element.getBoundingClientRect();
		const hit = document.elementFromPoint(left + width / 2, top + height / 2);
		return {
			inside: top >= 0 && top + height <= innerHeight && left >= 0 && left + width <= innerWidth,
			hit: hit !== null && element.contains(hit),
			height
		};
	});

const expectReachable = async (target: Locator, minHeight = 43.5) => {
	await expect(target).toBeVisible();
	const { inside, hit, height } = await reachable(target);
	expect({ inside, hit, tall: height >= minHeight }).toEqual({
		inside: true,
		hit: true,
		tall: true
	});
};

const rect = (target: Locator) =>
	target.evaluate((element) => {
		const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
		return { left, top, right, bottom, width, height };
	});

const selectionRect = (page: Page) =>
	page.evaluate(() => {
		const { left, top, right, bottom } = getSelection()!.getRangeAt(0).getBoundingClientRect();
		return { left, top, right, bottom };
	});

const menuOf = (page: Page) => page.locator('.toolbar.bubble');

/** The aria-labels of every formatting tool, and Link, that a phone keeps out of a fixed bar. */
const formatLabels = [
	editor.bold,
	editor.italic,
	editor.strike,
	editor.code,
	editor.bulletList,
	editor.orderedList,
	editor.taskList,
	editor.quote,
	editor.codeBlock,
	editor.kbd,
	editor.link,
	editor.heading(1),
	editor.heading(2),
	editor.heading(3)
];

const surfaces = [
	{
		name: 'post composer',
		path: `/projects/${project.id}/new`,
		box: bodyBox,
		footer: (page: Page) => [
			page.getByRole('button', { name: editor.attach }),
			page.getByRole('button', { name: postText.composer.submit, exact: true })
		]
	},
	{
		name: 'post edit page',
		path: `/posts/${posts.packing.id}/edit`,
		box: bodyBox,
		footer: (page: Page) => [
			page.getByRole('button', { name: editor.attach }),
			page.getByRole('button', { name: postText.composer.save, exact: true })
		]
	},
	{
		name: 'post page comment box',
		path: `/posts/${post.id}`,
		box: (page: Page) => box(page, /^Write a comment/),
		footer: (page: Page) => [
			page.getByRole('button', { name: editor.attach }),
			page.getByRole('button', { name: postText.comments.submit, exact: true })
		]
	},
	{
		name: 'chat',
		path: `/chat/${threads.bo.id}`,
		box: (page: Page) => box(page, /^Write a message/),
		footer: (page: Page) => [page.getByRole('button', { name: 'Send', exact: true })],
		key: 'Shift+Enter',
		// Chat's send button is a 28px disc inside the pill, so this row only checks it stays in view.
		minHeight: 0
	}
];

test.describe('phone, keyboard up (390 × 328)', () => {
	for (const surface of surfaces) {
		test(`${surface.name}: after 20 lines the footer actions are on screen and nothing formats from a bar`, async ({
			browser
		}) => {
			const page = await open(browser, keyboardUp, surface.path);
			await type(page, surface.box(page), 20, surface.key);
			for (const control of surface.footer(page)) await expectReachable(control, surface.minHeight);
			const bar = page.locator('.toolbar:not(.bubble) button');
			const labels = await bar.evaluateAll((buttons) =>
				buttons.map((button) => button.getAttribute('aria-label'))
			);
			expect(labels.filter((label) => formatLabels.includes(label!))).toEqual([]);
			await page.context().close();
		});
	}

	test('draft page: after 20 lines the footer actions are on screen', async ({ browser }) => {
		// The phone's composer is a page, not a dialog, so the draft is made on a desktop screen.
		const title = `Keyboard draft ${Date.now()}`;
		const author = await open(browser, desktop, `/projects/${project.id}/new`);
		await author
			.getByRole('dialog', { name: postText.composer.newPost })
			.getByRole('textbox', { name: postText.composer.title })
			.fill(title);
		await author.keyboard.press('Escape');
		await expect(author.getByText(postText.composer.draftKept)).toBeVisible();
		await author.context().close();

		const page = await open(browser, keyboardUp, '/drafts');
		await page.getByRole('link', { name: title }).first().click();
		await page.waitForURL(/\/drafts\//);
		await page.waitForLoadState('networkidle');
		await type(page, bodyBox(page), 20);
		for (const control of [
			page.getByRole('button', { name: editor.attach }),
			page.getByRole('button', { name: postText.composer.submit, exact: true })
		]) {
			await expectReachable(control);
		}
		await page.context().close();
	});

	test('note comment box: after focusing it at the end of the page, Comment is on screen', async ({
		browser
	}) => {
		const page = await open(browser, keyboardUp, `/notes/${notes.trip.id}`);
		await type(page, box(page, /^Write a comment/), 1);
		await expectReachable(
			page.getByRole('button', { name: postText.comments.submit, exact: true })
		);
		await page.context().close();
	});

	test('post composer: the caret stays above the footer on every line', async ({ browser }) => {
		const page = await open(browser, keyboardUp, `/projects/${project.id}/new`);
		const body = bodyBox(page);
		await body.tap();
		const footer = page.locator('[data-footer]');
		for (let i = 0; i < 20; i++) {
			await page.keyboard.type(`line ${i}`);
			await page.keyboard.press('Enter');
			const caret = await page.evaluate(() => {
				const range = getSelection()!.getRangeAt(0).cloneRange();
				range.collapse(true);
				// An empty line has no client rect of its own: the caret sits in its paragraph.
				const { bottom } =
					range.getClientRects()[0] ?? (range.startContainer as Element).getBoundingClientRect();
				const scrollers: string[] = [];
				for (let n = document.querySelector('.ProseMirror')!.parentElement; n; n = n.parentElement)
					if (n.scrollHeight > n.clientHeight)
						scrollers.push(
							`${n.tagName}.${n.className} top=${n.scrollTop} ${n.clientHeight}/${n.scrollHeight}`
						);
				return { bottom, scrollers };
			});
			const footerTop = (await rect(footer)).top;
			expect(
				caret.bottom,
				`line ${i}, footer top ${footerTop}, ${caret.scrollers}`
			).toBeLessThanOrEqual(footerTop + 0.5);
		}
		await page.context().close();
	});

	test('post composer: the footer shows a top border only while text is under it', async ({
		browser
	}) => {
		const page = await open(browser, keyboardUp, `/projects/${project.id}/new`);
		await type(page, bodyBox(page), 20);
		const footer = page.locator('[data-footer]');
		const border = () => footer.evaluate((el) => getComputedStyle(el).borderTopColor);
		const scroller = page.locator('div.new-post');
		await scroller.evaluate((el) => (el.scrollTop = 0));
		const shown = await border();
		await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
		await expect.poll(border).toBe('rgba(0, 0, 0, 0)');
		expect(shown).not.toBe('rgba(0, 0, 0, 0)');
		await page.context().close();
	});

	test('post page comment box: capped at 40% of the visible height and scrolls inside', async ({
		browser
	}) => {
		const page = await open(browser, keyboardUp, `/posts/${post.id}`);
		await type(page, box(page, /^Write a comment/), 20);
		const content = page.locator('.composer .editor .content');
		const { height, scrollable } = await content.evaluate((el) => ({
			height: el.getBoundingClientRect().height,
			scrollable: el.scrollHeight > el.clientHeight
		}));
		expect(height).toBeLessThanOrEqual(0.4 * 328 + 1);
		expect(scrollable).toBe(true);
		await page.context().close();
	});

	test('post composer: the selection menu and the slash list are on screen after 20 lines', async ({
		browser
	}) => {
		const page = await open(browser, keyboardUp, `/projects/${project.id}/new`);
		await type(page, bodyBox(page), 20);
		await page.keyboard.type('last word');
		await selectBack(page, 4);
		await expectReachable(menuOf(page).getByRole('button', { name: editor.link, exact: true }));
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('Enter');
		await page.keyboard.type('/');
		const list = page.getByRole('listbox', { name: editor.slash.list });
		await expect(list).toBeVisible();
		const { top, bottom } = await rect(list.locator('xpath=..'));
		expect(top).toBeGreaterThanOrEqual(0);
		expect(bottom).toBeLessThanOrEqual(328);
		await page.context().close();
	});

	test('live note: no toolbar, and the selection menu is on screen after 20 lines', async ({
		browser
	}) => {
		const page = await open(browser, keyboardUp, `/notes/${notes.trip.id}`);
		await type(page, bodyBox(page), 20);
		await page.keyboard.type('last word');
		await selectBack(page, 4);
		await expect(page.locator('.toolbar:not(.bubble)')).toBeHidden();
		await expectReachable(menuOf(page).getByRole('button', { name: editor.link, exact: true }));
		await page.context().close();
	});

	test('the keyboard stub moves --keyboard-inset, and the comment box and chat bar follow', async ({
		browser
	}) => {
		const stub = (height: number) => (page: Page) =>
			page.evaluate((h) => {
				Object.defineProperty(window.visualViewport!, 'height', { value: h, configurable: true });
				window.visualViewport!.dispatchEvent(new Event('resize'));
			}, height);
		const page = await open(
			browser,
			{ ...iPhone, viewport: { width: 390, height: 664 } },
			`/posts/${post.id}`
		);
		await stub(328)(page);
		await expect
			.poll(() =>
				page.evaluate(() => document.documentElement.style.getPropertyValue('--keyboard-inset'))
			)
			.toBe('336px');
		const bottom = (await rect(page.locator('.composer'))).bottom;
		expect(Math.abs(bottom - 328)).toBeLessThanOrEqual(1);
		await stub(664)(page);
		await expect
			.poll(() =>
				page.evaluate(() => document.documentElement.style.getPropertyValue('--keyboard-inset'))
			)
			.toBe('0px');

		await page.goto(`/chat/${threads.bo.id}`, { waitUntil: 'networkidle' });
		await stub(328)(page);
		await expect
			.poll(async () => Math.abs((await rect(page.locator('.composer-bar'))).bottom - 328))
			.toBeLessThanOrEqual(1);
		await page.context().close();
	});

	test('focused, the footer padding drops the home-indicator inset', async ({ browser }) => {
		const page = await open(browser, keyboardUp, `/chat/${threads.bo.id}`);
		const padding = () =>
			page.locator('.composer-bar').evaluate((el) => getComputedStyle(el).paddingBottom);
		await box(page, /^Write a message/).tap();
		await expect.poll(padding).toBe('8px');

		await page.goto(`/posts/${post.id}`, { waitUntil: 'networkidle' });
		await box(page, /^Write a comment/).tap();
		await expect
			.poll(() => page.locator('.composer').evaluate((el) => getComputedStyle(el).paddingBottom))
			.toBe('12px');
		await page.context().close();
	});
});

test.describe('phone selection menu', () => {
	for (const width of [375, 390]) {
		test(`live note at ${width}px: one row of 44px buttons that fits`, async ({ browser }) => {
			const page = await open(
				browser,
				{ ...keyboardUp, viewport: { width, height: 328 } },
				`/notes/${notes.trip.id}`
			);
			await type(page, bodyBox(page), 1);
			await page.keyboard.type('alpha beta');
			await selectBack(page, 4);
			const menu = menuOf(page);
			await expect(menu).toBeVisible();
			const names = await menu
				.getByRole('button')
				.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
			expect(names).toEqual([
				editor.formatMenu.label,
				editor.bold,
				editor.italic,
				editor.code,
				editor.link,
				noteText.passage.comment
			]);
			for (const button of await menu.getByRole('button').all()) {
				const { width: w, height } = await rect(button);
				expect(Math.min(w, height)).toBeGreaterThanOrEqual(43.5);
			}
			const { width: w, height } = await rect(menu);
			expect(Math.abs(height - 52)).toBeLessThanOrEqual(1);
			expect(w).toBeLessThanOrEqual(width - 16);
			await page.context().close();
		});
	}

	test('post composer: Format, Bold, Italic, Code and Link, and no passage Comment', async ({
		browser
	}) => {
		const page = await open(browser, keyboardUp, `/projects/${project.id}/new`);
		await type(page, bodyBox(page), 1);
		await page.keyboard.type('alpha beta');
		await selectBack(page, 4);
		const names = await menuOf(page)
			.getByRole('button')
			.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
		expect(names).toEqual([
			editor.formatMenu.label,
			editor.bold,
			editor.italic,
			editor.code,
			editor.link
		]);
		for (const button of await menuOf(page).getByRole('button').all()) {
			const { width, height } = await rect(button);
			expect(Math.min(width, height)).toBeGreaterThanOrEqual(43.5);
		}
		await page.context().close();
	});

	test('Format drops the keyboard, turns the block into a heading and keeps the selection', async ({
		browser
	}) => {
		const page = await open(browser, keyboardUp, `/notes/${notes.trip.id}`);
		const body = bodyBox(page);
		await type(page, body, 1);
		await page.keyboard.type('alpha beta');
		await selectBack(page, 4);
		await menuOf(page).getByRole('button', { name: editor.formatMenu.label }).tap();
		await expect(page.getByRole('menuitemcheckbox', { name: editor.strike })).toBeVisible();
		await expect(page.getByRole('menuitemcheckbox', { name: editor.kbd })).toBeVisible();
		expect(await body.evaluate((el) => el.contains(document.activeElement))).toBe(false);
		await page.getByRole('menuitemcheckbox', { name: editor.heading(2) }).tap();
		await expect(body.locator('h2', { hasText: 'alpha beta' })).toBeVisible();
		await expect.poll(() => body.evaluate((el) => el.contains(document.activeElement))).toBe(true);
		expect(await page.evaluate(() => getSelection()!.toString())).toBe('beta');

		await menuOf(page).getByRole('button', { name: editor.formatMenu.label }).tap();
		await page.getByRole('menuitemcheckbox', { name: editor.strike }).tap();
		await expect(body.locator('s', { hasText: 'beta' })).toBeVisible();
		await page.context().close();
	});

	test('in an editable note the menu replaces the passage Comment button and opens its form', async ({
		browser
	}) => {
		const page = await open(browser, keyboardUp, `/notes/${notes.trip.id}`);
		await type(page, bodyBox(page), 1);
		await page.keyboard.type('alpha beta');
		await selectBack(page, 4);
		await expect(menuOf(page)).toBeVisible();
		await expect(page.locator('.passage-tools button')).toBeHidden();
		await menuOf(page).getByRole('button', { name: noteText.passage.comment }).tap();
		await expect(page.getByLabel(noteText.passage.formLabel)).toBeVisible();
		await page.context().close();
	});

	test('on touch the menu is 12px below the selection and the link field leaves it where it is', async ({
		browser
	}) => {
		const page = await open(
			browser,
			{ ...iPhone, viewport: { width: 390, height: 664 } },
			`/projects/${project.id}/new`
		);
		await type(page, bodyBox(page), 10);
		for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowUp');
		await page.keyboard.press('Home');
		for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
		const menu = menuOf(page);
		await expect(menu).toBeVisible();
		const selected = await selectionRect(page);
		const at = await rect(menu);
		expect(Math.abs(at.top - (selected.bottom + 12))).toBeLessThanOrEqual(1);
		expect(at.left).toBeGreaterThanOrEqual(8);
		expect(at.right).toBeLessThanOrEqual(390 - 8);
		expect(
			await menu.evaluate((el) => {
				const { left, top, width, height } = el.getBoundingClientRect();
				return el.contains(document.elementFromPoint(left + width / 2, top + height / 2));
			})
		).toBe(true);

		await menu.getByRole('button', { name: editor.link, exact: true }).tap();
		const field = page.getByRole('textbox', { name: editor.linkUrl });
		await expect(field).toBeVisible();
		expect(Math.abs((await rect(menu)).top - at.top)).toBeLessThanOrEqual(1);
		expect(
			await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
		).toBeGreaterThanOrEqual(16);
		await page.context().close();
	});

	test('a read-only note: the passage Comment button sits 12px below the selection on touch', async ({
		browser
	}) => {
		const page = await open(
			browser,
			{ ...iPhone, viewport: { width: 390, height: 664 } },
			`/notes/${notes.trip.id}`,
			'cy'
		);
		await expect(bodyBox(page)).toHaveAttribute('contenteditable', 'false');
		await bodyBox(page).evaluate((element) => {
			const node = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()!;
			const range = document.createRange();
			range.setStart(node, 0);
			range.setEnd(node, 7);
			getSelection()!.removeAllRanges();
			getSelection()!.addRange(range);
		});
		const tools = page.locator('.passage-tools');
		await expect(tools).toBeVisible();
		const selected = await selectionRect(page);
		expect(Math.abs((await rect(tools)).top - (selected.bottom + 12))).toBeLessThanOrEqual(1);
		await page.context().close();
	});

	test('on touch the menu goes above a selection on the last line and clears the footer', async ({
		browser
	}) => {
		const page = await open(browser, keyboardUp, `/projects/${project.id}/new`);
		await type(page, bodyBox(page), 20);
		await page.keyboard.type('last word');
		await selectBack(page, 4);
		const menu = menuOf(page);
		await expect(menu).toBeVisible();
		const selected = await selectionRect(page);
		const at = await rect(menu);
		const footer = await rect(page.locator('[data-footer]'));
		expect(at.bottom).toBeLessThanOrEqual(selected.top - 8 + 1);
		expect(at.bottom <= footer.top || at.top >= footer.bottom).toBe(true);
		await page.context().close();
	});

	test('with the keyboard stub the lower bound is the visual viewport, not the layout one', async ({
		browser
	}) => {
		const page = await open(
			browser,
			{ ...iPhone, viewport: { width: 390, height: 664 } },
			`/projects/${project.id}/new`
		);
		await type(page, bodyBox(page), 10);
		await page.keyboard.type('alpha beta gamma');
		await page.evaluate(() => {
			Object.defineProperty(window.visualViewport!, 'height', { value: 328, configurable: true });
			window.visualViewport!.dispatchEvent(new Event('resize'));
		});
		await selectBack(page, 5);
		const menu = menuOf(page);
		await expect(menu).toBeVisible();
		const { bottom } = await rect(menu);
		expect(bottom).toBeLessThanOrEqual(328);
		await page.context().close();
	});
});

test.describe('slash inserts', () => {
	test('/time inserts a time at the caret in a note', async ({ browser }) => {
		const page = await open(browser, keyboardUp, `/notes/${notes.trip.id}`);
		const body = bodyBox(page);
		await type(page, body, 1);
		await page.keyboard.type('/time');
		await expect(page.getByRole('option')).toContainText(editor.slash.time.label);
		await page.keyboard.press('Enter');
		await expect
			.poll(() =>
				body.evaluate((el) =>
					JSON.stringify((el as unknown as { editor: { getJSON(): unknown } }).editor.getJSON())
				)
			)
			.toContain('relativeTime');
		await page.context().close();
	});

	for (const [name, path] of [
		['a live note', `/notes/${notes.trip.id}`],
		['the post composer', `/projects/${project.id}/new`]
	]) {
		test(`/image opens the file chooser in ${name}`, async ({ browser }) => {
			const page = await open(browser, keyboardUp, path);
			await type(page, bodyBox(page), 1);
			await page.keyboard.type('/image');
			// Enter picks the highlighted row, so wait until the typed word has narrowed the list to it.
			await expect(page.getByRole('option')).toContainText(editor.slash.file.label);
			// Playwright's file-chooser hook can miss a click that comes right after it is set, so the
			// spec watches the app's own call: the item clicks the editor's file input.
			await page.evaluate(() => {
				const clicks: string[] = [];
				(window as unknown as { fileClicks: string[] }).fileClicks = clicks;
				HTMLInputElement.prototype.click = function () {
					clicks.push(this.type);
				};
			});
			await page.keyboard.press('Enter');
			await expect
				.poll(() => page.evaluate(() => (window as unknown as { fileClicks: string[] }).fileClicks))
				.toEqual(['file']);
			await page.context().close();
		});
	}

	test('/image is offered where files can go: not on /notes/new', async ({ browser }) => {
		const composer = await open(browser, keyboardUp, `/projects/${project.id}/new`);
		await type(composer, bodyBox(composer), 1);
		await composer.keyboard.type('/');
		await expect(composer.getByRole('listbox', { name: editor.slash.list })).toBeVisible();
		await expect(composer.getByRole('option', { name: editor.slash.file.label })).toBeVisible();
		await composer.context().close();

		const created = await open(browser, keyboardUp, '/notes/new');
		await type(created, bodyBox(created), 1);
		await created.keyboard.type('/');
		await expect(created.getByRole('option', { name: editor.slash.time.label })).toBeVisible();
		await expect(created.getByRole('option', { name: editor.slash.file.label })).toHaveCount(0);
		await created.context().close();
	});
});

test.describe('phone: no fixed formatting bar on any surface', () => {
	const toolSurfaces = [
		...surfaces,
		{ name: 'live note', path: `/notes/${notes.trip.id}`, box: bodyBox },
		{ name: 'new note', path: '/notes/new', box: bodyBox }
	];
	for (const surface of toolSurfaces) {
		test(`${surface.name}: with the editor focused, formatting is only in the selection menu`, async ({
			browser
		}) => {
			const page = await open(browser, keyboardUp, surface.path);
			await surface.box(page).tap();
			const shown = await page
				.locator('.toolbar:not(.bubble) button')
				.evaluateAll((buttons) =>
					buttons
						.filter((button) => button.getBoundingClientRect().width > 0)
						.map((button) => button.getAttribute('aria-label'))
				);
			expect(shown.filter((label) => formatLabels.includes(label!))).toEqual([]);
			if (surface.name.includes('note')) {
				await expect(page.locator('.toolbar:not(.bubble)')).toBeHidden();
			}
			await page.context().close();
		});
	}
});

test.describe('desktop 1280 × 800', () => {
	test('notes keep their toolbar', async ({ browser }) => {
		const live = await open(browser, desktop, `/notes/${notes.trip.id}`);
		await expect(live.locator('.toolbar:not(.bubble)')).toBeVisible();
		expect(await live.locator('.toolbar:not(.bubble) button').count()).toBe(17);
		await live.context().close();

		const created = await open(browser, desktop, '/notes/new');
		await expect(created.locator('.toolbar:not(.bubble)')).toBeVisible();
		expect(await created.locator('.toolbar:not(.bubble) button').count()).toBe(16);
		await created.context().close();
	});

	test('the post composer: selection menu above the selection, footer not sticky', async ({
		browser
	}) => {
		const page = await open(browser, desktop, `/projects/${project.id}/new`);
		await bodyBox(page).click();
		await page.keyboard.type('alpha beta');
		await selectBack(page, 4);
		const menu = menuOf(page);
		await expect(menu).toBeVisible();
		const selected = await selectionRect(page);
		expect(Math.abs((await rect(menu)).bottom - (selected.top - 8))).toBeLessThanOrEqual(1);
		const labels = await menu
			.getByRole('button')
			.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
		expect(labels).toEqual([
			editor.heading(1),
			editor.heading(2),
			editor.heading(3),
			editor.bold,
			editor.italic,
			editor.strike,
			editor.code,
			editor.bulletList,
			editor.orderedList,
			editor.taskList,
			editor.quote,
			editor.codeBlock,
			editor.link
		]);
		expect(
			await page.locator('[data-footer]').evaluate((el) => getComputedStyle(el).position)
		).toBe('static');
		await page.context().close();
	});

	test('the comment box and chat footers keep their padding', async ({ browser }) => {
		const comment = await open(browser, desktop, `/posts/${post.id}`);
		expect(
			await comment.locator('.composer').evaluate((el) => getComputedStyle(el).paddingBottom)
		).toBe('12px');
		expect(
			await comment
				.locator('.composer .editor .content')
				.evaluate((el) => getComputedStyle(el).overflowY)
		).toBe('visible');
		await comment.context().close();

		const chat = await open(browser, desktop, `/chat/${threads.bo.id}`);
		expect(
			await chat.locator('.composer-bar').evaluate((el) => getComputedStyle(el).paddingBottom)
		).toBe('8px');
		await chat.context().close();
	});
});

test.describe('tablet (iPad, touch, 820 wide)', () => {
	test('keeps the toolbar and footers, and the menu opens below the selection', async ({
		browser
	}) => {
		const tablet = { ...iPad, viewport: { width: 820, height: 1180 } };
		const note = await open(browser, tablet, `/notes/${notes.trip.id}`);
		await expect(note.locator('.toolbar:not(.bubble)')).toBeVisible();
		await note.context().close();

		const page = await open(browser, tablet, `/projects/${project.id}/new`);
		expect(
			await page.locator('[data-footer]').evaluate((el) => getComputedStyle(el).position)
		).toBe('static');
		await bodyBox(page).tap();
		await page.keyboard.type('alpha beta');
		await selectBack(page, 4);
		const menu = menuOf(page);
		await expect(menu).toBeVisible();
		const selected = await selectionRect(page);
		expect(Math.abs((await rect(menu)).top - (selected.bottom + 12))).toBeLessThanOrEqual(1);
		await page.context().close();
	});
});
