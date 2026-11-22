// A writing surface shows its caret and nothing else: no outline, ring or glow on the note, the
// post composer or the dialog around it. The comment box darkens its own edge instead. Controls
// keep their keyboard ring. On a 390 × 844 touch screen and a 1280 × 800 window, in light and
// dark. Against the built Worker (serve.ts).
import {
	expect,
	test,
	type Browser,
	type BrowserContextOptions,
	type Locator,
	type Page
} from '@playwright/test';
import { baseURL, people, posts, project } from './fixtures.ts';

const profiles: Record<string, { use: BrowserContextOptions; touch: boolean }> = {
	phone: {
		use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
		touch: true
	},
	desktop: { use: { viewport: { width: 1280, height: 800 } }, touch: false }
};
const schemes = ['light', 'dark'] as const;

/** Ada, signed in on a screen like `use`. */
async function signIn(browser: Browser, use: BrowserContextOptions) {
	const context = await browser.newContext({ ...use, baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	return context.newPage();
}

/** What `value` (a colour or a var()) resolves to on this page, written as the browser writes colours. */
const resolve = (page: Page, value: string) =>
	page.evaluate((colour) => {
		const probe = document.createElement('span');
		probe.style.color = colour;
		document.body.appendChild(probe);
		const resolved = getComputedStyle(probe).color;
		probe.remove();
		return resolved;
	}, value);

const outlineOf = (target: Locator) =>
	target.evaluate((element) => {
		const { outlineStyle, boxShadow } = getComputedStyle(element);
		return { outlineStyle, boxShadow };
	});

/** Presses Tab from the top of the page until `target` has focus. */
async function tabTo(page: Page, target: Locator) {
	for (let presses = 0; presses < 80; presses++) {
		await page.keyboard.press('Tab');
		if (await target.evaluate((element) => element === document.activeElement)) return;
	}
	throw new Error(`Tab never reached ${target}: expected it within 80 presses`);
}

const surfaces = [
	{
		name: 'a new note',
		body: '.ProseMirror',
		title: '.note-title',
		open: async (browser: Browser, use: BrowserContextOptions) => {
			const page = await signIn(browser, use);
			await page.goto('/notes/new', { waitUntil: 'networkidle' });
			return page;
		}
	},
	{
		name: 'the new post dialog',
		body: '.composer-card .ProseMirror',
		title: '.composer-card .subject input',
		open: async (browser: Browser, use: BrowserContextOptions) => {
			const page = await signIn(browser, use);
			await page.goto(`/projects/${project.id}/new`, { waitUntil: 'networkidle' });
			await expect(page.getByRole('dialog', { name: 'New thread' })).toBeVisible();
			return page;
		}
	},
	{
		name: 'a post being edited',
		body: '.composer-card .ProseMirror',
		title: '.composer-card .subject input',
		open: async (browser: Browser, use: BrowserContextOptions) => {
			const page = await signIn(browser, use);
			await page.goto(`/posts/${posts.packing.id}/edit`, { waitUntil: 'networkidle' });
			return page;
		}
	},
	{
		name: 'a draft',
		body: '.composer-card .ProseMirror',
		title: '.composer-card .subject input',
		open: async (browser: Browser, use: BrowserContextOptions) => {
			const page = await signIn(browser, use);
			await page.goto(`/projects/${project.id}/new`, { waitUntil: 'networkidle' });
			const dialog = page.getByRole('dialog', { name: 'New thread' });
			await dialog.getByRole('textbox', { name: 'Title' }).fill('Calm focus draft');
			await page.keyboard.press('Escape');
			await expect(page.getByText('Draft saved')).toBeVisible();
			await page.goto('/drafts', { waitUntil: 'networkidle' });
			await page.getByRole('link', { name: 'Calm focus draft' }).first().click();
			await page.waitForURL(/\/drafts\//);
			await page.waitForLoadState('networkidle');
			return page;
		}
	}
];

for (const [profile, { use, touch }] of Object.entries(profiles)) {
	for (const surface of surfaces) {
		for (const field of ['body', 'title'] as const) {
			for (const how of ['pointer', 'Tab'] as const) {
				test(`${profile}: in ${surface.name}, the ${field} reached by ${how} has no outline or shadow and a --hue-caret caret`, async ({
					browser
				}) => {
					const page = await surface.open(browser, use);
					const target = page.locator(surface[field]);
					if (how === 'Tab') {
						await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
						await tabTo(page, target);
					} else {
						await (touch ? target.tap() : target.click());
					}
					await expect(target).toBeFocused();
					expect(await outlineOf(target)).toEqual({ outlineStyle: 'none', boxShadow: 'none' });
					const caret = await target.evaluate((element) => getComputedStyle(element).caretColor);
					expect(caret).toBe(await resolve(page, 'var(--hue-caret)'));
					expect(caret).not.toBe(await resolve(page, 'var(--hue-z0-fg)'));
					await page.context().close();
				});
			}
		}
	}

	test(`${profile}: a dialog opened by click draws no outline on its panel or anything in it until a key is pressed`, async ({
		browser
	}) => {
		const page = await signIn(browser, use);
		if (touch) {
			await page.goto(`/projects/${project.id}/new`, { waitUntil: 'networkidle' });
		} else {
			await page.goto('/', { waitUntil: 'networkidle' });
			await page.getByRole('button', { name: 'Start a thread or a document' }).click();
			await page.getByRole('menuitem', { name: /^New thread/ }).click();
		}
		const dialog = page.getByRole('dialog', { name: 'New thread' });
		await expect(dialog).toBeVisible();
		await expect
			.poll(() => dialog.evaluate((panel) => panel.contains(document.activeElement)))
			.toBe(true);
		const outlined = await dialog.evaluate((panel) =>
			[panel, ...panel.querySelectorAll('*')]
				.filter((element) => getComputedStyle(element).outlineStyle !== 'none')
				.map((element) => element.tagName + '.' + element.className)
		);
		expect(outlined).toEqual([]);
		await page.context().close();
	});

	for (const colorScheme of schemes) {
		test(`${profile}, ${colorScheme}: the comment box swaps its hairline for a 1px edge one step darker, with no ring or halo`, async ({
			browser
		}) => {
			const page = await signIn(browser, { ...use, colorScheme });
			await page.goto(`/posts/${posts.packing.id}`, { waitUntil: 'networkidle' });
			const box = page.locator('form.comment-form:not([data-inline]) .box');
			const shadowOf = () => box.evaluate((element) => getComputedStyle(element).boxShadow);
			/** Each layer of a computed box-shadow as its colour and its spread. */
			const layers = (shadow: string) =>
				[
					...shadow.matchAll(
						/((?:rgba?|color)\([^)]*\)) -?[\d.]+px -?[\d.]+px -?[\d.]+px (-?[\d.]+)px/g
					)
				].map(([, colour, spread]) => ({ colour, spread: parseFloat(spread) }));
			const rest = await resolve(page, 'var(--hue-z0-border)');
			const edge = await resolve(page, 'var(--hue-field-edge-focus)');
			expect(edge).not.toBe(rest);

			expect(layers(await shadowOf()).at(-1)).toEqual({ colour: rest, spread: 0.5 });
			await (touch ? box.getByRole('textbox').tap() : box.getByRole('textbox').click());
			await expect(box.getByRole('textbox')).toBeFocused();
			const focused = layers(await shadowOf());
			expect(focused.at(-1)).toEqual({ colour: edge, spread: 1 });
			expect(focused.filter(({ spread }) => spread >= 2)).toEqual([]);
			await page.context().close();
		});
	}
}

test('an inline reply box has no edge at rest and none on focus', async ({ browser }) => {
	const page = await signIn(browser, profiles.desktop.use);
	await page.goto(`/posts/${posts.packing.id}`, { waitUntil: 'networkidle' });
	const reply = page.locator('.thread [data-inline] .box').first();
	await expect(reply).toHaveCSS('box-shadow', 'none');
	await reply.getByRole('textbox').click();
	await expect(reply.getByRole('textbox')).toBeFocused();
	await expect(reply).toHaveCSS('box-shadow', 'none');
	await page.context().close();
});

for (const colorScheme of schemes) {
	test(`desktop, ${colorScheme}: selected text in the note is painted with --hue-selection`, async ({
		browser
	}) => {
		const page = await signIn(browser, { ...profiles.desktop.use, colorScheme });
		await page.goto('/notes/new', { waitUntil: 'networkidle' });
		const body = page.locator('.ProseMirror');
		await body.click();
		await page.keyboard.type('Selected words');
		await page.keyboard.press('ControlOrMeta+a');
		const selected = await body.evaluate(
			(element) => getComputedStyle(element, '::selection').backgroundColor
		);
		const wash = await page.evaluate(() => {
			const probe = document.createElement('span');
			probe.style.backgroundColor = 'var(--hue-selection)';
			document.body.appendChild(probe);
			const resolved = getComputedStyle(probe).backgroundColor;
			probe.remove();
			return resolved;
		});
		expect(selected).toBe(wash);
		expect(wash).not.toBe('rgba(0, 0, 0, 0)');
		await page.context().close();
	});
}

test('Tab from the note body on to the controls keeps their --hue-focus-ring outline', async ({
	browser
}) => {
	const page = await signIn(browser, profiles.desktop.use);
	await page.goto('/notes/new', { waitUntil: 'networkidle' });
	await page.locator('.ProseMirror').click();
	const ring = await resolve(page, 'var(--hue-focus-ring)');
	const seen: string[] = [];
	for (let presses = 0; presses < 40; presses++) {
		await page.keyboard.press('Tab');
		const focus = await page.evaluate(() => {
			const element = document.activeElement;
			if (!element || !element.matches('button, a[href], [role="button"], [role="menuitem"]'))
				return null;
			const { outlineStyle, outlineWidth, outlineColor } = getComputedStyle(element);
			return {
				name: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '',
				outlineStyle,
				outlineWidth,
				outlineColor
			};
		});
		if (!focus) continue;
		seen.push(focus.name);
		expect(focus, `the ring on ${focus.name}`).toMatchObject({
			outlineStyle: 'solid',
			outlineWidth: '2px',
			outlineColor: ring
		});
	}
	expect(seen.length, 'controls reached by Tab after the body').toBeGreaterThan(0);
	await page.context().close();
});
