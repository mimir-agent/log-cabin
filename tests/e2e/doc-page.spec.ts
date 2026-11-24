// A doc is a page: 800px wide, its text on a 640px line, its title and comments on the same
// line, and its wide blocks using the whole page. On a 390 × 844 touch screen and a 1280 × 800
// window, light and dark. Against the built Worker (serve.ts).
import {
	expect,
	test,
	type Browser,
	type BrowserContext,
	type BrowserContextOptions,
	type Locator
} from '@playwright/test';
import { baseURL, images, people } from './fixtures.ts';
import { liveContext } from './editor.ts';

const profiles: Record<string, { use: BrowserContextOptions; page: number; line: number }> = {
	phone: {
		use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ...liveContext },
		page: 358,
		line: 358
	},
	desktop: { use: { viewport: { width: 1280, height: 800 }, ...liveContext }, page: 800, line: 640 }
};

const text = (value: string) => ({ type: 'text', text: value });
const block = (type: string, ...content: object[]) => ({ type, content });
const paragraph = (value: string) => block('paragraph', text(value));
const item = (value: string) => block('listItem', paragraph(value));

/** A paragraph, H2, list, quote, image and code block. The editor has no table block. */
const doc = JSON.stringify({
	type: 'doc',
	content: [
		paragraph('A doc begins with a line of text.'),
		{ type: 'heading', attrs: { level: 2 }, content: [text('A section')] },
		block('bulletList', item('First point'), item('Second point')),
		block('blockquote', paragraph('A quotation.')),
		{ type: 'image', attrs: { src: `/files/attachments/${images[0].id}`, alt: 'A lake' } },
		{ type: 'codeBlock', attrs: { language: null }, content: [text('const page = 800;')] }
	]
});

async function signIn(browser: Browser, use: BrowserContextOptions) {
	const context = await browser.newContext({ ...use, baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	return context;
}

/** Submits a form action as a browser would, and returns where it redirected. */
async function submit(context: BrowserContext, path: string, form: Record<string, string>) {
	const response = await context.request.post(path, {
		form,
		headers: { origin: baseURL, accept: 'text/html' },
		maxRedirects: 0
	});
	expect(response.status(), `${path} answered ${await response.text()}`).toBeLessThan(400);
	return response.headers().location!;
}

const width = async (target: Locator) => (await target.boundingBox())!.width;
const centre = async (target: Locator) => {
	const box = (await target.boundingBox())!;
	return box.x + box.width / 2;
};

/** The width of the box's content, which is what a container measures. */
const contentWidth = (target: Locator) =>
	target.evaluate((element) => {
		const style = getComputedStyle(element);
		return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
	});

async function open(context: BrowserContext, path: string) {
	const page = await context.newPage();
	await page.goto(path, { waitUntil: 'networkidle' });
	await expect(page.locator('[role="status"][data-status="live"]')).toBeVisible();
	return page;
}

for (const [profile, { use, page: pageWidth, line }] of Object.entries(profiles)) {
	test.describe(profile, () => {
		let context: BrowserContext;
		let notePath: string;
		test.beforeAll(async ({ browser }) => {
			context = await signIn(browser, use);
			notePath = await submit(context, '/notes/new', { title: 'Page', body: doc });
			await submit(context, `${notePath}?/comment`, {
				id: `01E2ED0CC0MMENT${profile === 'phone' ? 'PH' : 'DT'}`.padEnd(26, '0'),
				body: JSON.stringify({ type: 'doc', content: [paragraph('A comment on the page.')] })
			});
		});
		test.afterAll(() => context.close());

		for (const scheme of ['light', 'dark'] as const) {
			test(`${scheme}: the page is ${pageWidth}px, the text and title ${line}px, wide blocks ${pageWidth}px and centred`, async () => {
				const page = await open(context, notePath);
				await page.emulateMedia({ colorScheme: scheme });
				const prose = page.locator('.body .ProseMirror');
				await expect(prose.locator('img')).toBeVisible();

				expect(await contentWidth(page.locator('article.doc')), 'the article').toBe(pageWidth);
				expect(await width(prose), 'the editor block').toBe(line);
				expect(await width(page.locator('.note-title')), 'the title').toBe(line);
				if (line === 640) {
					expect(await prose.evaluate((e) => getComputedStyle(e).maxWidth), 'its line').toBe(
						'640px'
					);
				}
				for (const wide of [prose.locator('> img'), prose.locator('> pre')]) {
					expect(await width(wide), 'a wide block').toBe(pageWidth);
					expect(Math.abs((await centre(wide)) - (await centre(prose))), 'centred').toBeLessThan(1);
				}
				const overflow = await page.evaluate(
					() => document.documentElement.scrollWidth - innerWidth
				);
				expect(overflow, 'sideways scroll').toBe(0);

				await test.info().attach(`doc-${profile}-${scheme}`, {
					body: await page.screenshot({ fullPage: true }),
					contentType: 'image/png'
				});
			});
		}

		test('the doc as it paints before the editor connects uses the same page', async () => {
			const page = await context.newPage();
			await page.addInitScript(() => {
				window.WebSocket = class extends EventTarget {
					readyState = 0;
					send() {}
					close() {}
				} as unknown as typeof WebSocket;
			});
			await page.goto(notePath);
			const prose = page.locator('.painted .prose');
			await expect(prose.locator('img')).toBeVisible();
			expect(await width(prose), 'the read block').toBe(line);
			expect(await width(prose.locator('> .image')), 'the image').toBe(pageWidth);
			expect(await width(prose.locator('> pre')), 'the code').toBe(pageWidth);
		});

		test('a run of images in the editor sits in tiles on the text column, side by side', async () => {
			const image = (i: number) => ({
				type: 'image',
				attrs: { src: `/files/attachments/${images[i].id}`, alt: `Image ${i}` }
			});
			const gallery = JSON.stringify({
				type: 'doc',
				content: [paragraph('Two images.'), image(0), { type: 'paragraph' }, image(1)]
			});
			const path = await submit(context, '/notes/new', { title: 'Tiles', body: gallery });
			const page = await open(context, path);
			const prose = page.locator('.body .ProseMirror');
			const tiles = prose.locator('> .gallery-tile');
			await expect(tiles).toHaveCount(2);

			const left = (await prose.boundingBox())!.x;
			const first = (await tiles.nth(0).boundingBox())!;
			const second = (await tiles.nth(1).boundingBox())!;
			expect(first.x, 'the first tile starts on the text column').toBeGreaterThanOrEqual(left);
			expect(second.x, 'the second tile starts after the first ends').toBeGreaterThanOrEqual(
				first.x + first.width
			);
		});

		test('comments are quiet: no grey band, unboxed threads, the text column', async () => {
			const page = await open(context, notePath);
			const section = page.locator('section.comments');
			await expect(section.locator('.thread')).toBeVisible();

			const band = await section.evaluate((e) => getComputedStyle(e).backgroundColor);
			expect(band, 'the section paints nothing over the page').toBe('rgba(0, 0, 0, 0)');
			const thread = await section.locator('.thread').evaluate((e) => {
				const style = getComputedStyle(e);
				return {
					border: style.borderTopWidth,
					radius: style.borderTopLeftRadius,
					background: style.backgroundColor
				};
			});
			expect(thread).toEqual({ border: '0px', radius: '0px', background: 'rgba(0, 0, 0, 0)' });
			expect(await contentWidth(section.locator('.comments-column')), 'the column').toBe(line);
		});
	});
}
