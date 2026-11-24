// What you write is what people read: the editor and the rendered text compute the same type,
// long-form lines hold about 71 characters, note headings sit on suede's scale, and the blocks
// (lists, quote, code, rule) read as set. On a 390 × 844 touch screen and a 1280 × 800 window.
// Against the built Worker (serve.ts).
import {
	expect,
	test,
	type Browser,
	type BrowserContext,
	type BrowserContextOptions,
	type Locator,
	type Page
} from '@playwright/test';
import { baseURL, people, posts, project, threads } from './fixtures.ts';
import { liveContext } from './editor.ts';

const profiles: Record<string, { use: BrowserContextOptions; touch: boolean }> = {
	phone: {
		use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ...liveContext },
		touch: true
	},
	desktop: { use: { viewport: { width: 1280, height: 800 }, ...liveContext }, touch: false }
};

const text = (value: string, marks?: { type: string }[]) => ({ type: 'text', text: value, marks });
const block = (type: string, ...content: object[]) => ({ type, content });
const paragraph = (value: string) => block('paragraph', text(value));
const heading = (level: number, value: string) => ({
	type: 'heading',
	attrs: { level },
	content: [text(value)]
});
const items = (type: string, ...values: string[]) =>
	block(type, ...values.map((value) => block('listItem', paragraph(value))));

/** A character count of an unbroken string and of a code line, as a phone's width tests them. */
const unbroken = 'x'.repeat(200);
const codeLine = 'const widest = measure(everyLine, theWidth);';

/** Every block a note has, in the order a reader meets them. */
const everyBlock = [
	paragraph('The note begins with a line, so each heading has something above it.'),
	heading(1, 'Heading one'),
	paragraph('A paragraph of the note, set in the body size with a line of its own.'),
	heading(2, 'Heading two'),
	items('bulletList', 'First point', 'Second point'),
	heading(3, 'Heading three'),
	items('orderedList', 'One', 'Two', 'Three'),
	block('blockquote', paragraph('A quotation, in the colour of the text around it.')),
	{
		type: 'codeBlock',
		attrs: { language: null },
		content: [text(codeLine)]
	},
	{ type: 'horizontalRule' },
	paragraph(unbroken)
];

const docOf = (content: object[]) => JSON.stringify({ type: 'doc', content });

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
	return response.headers().location;
}

const newNote = (context: BrowserContext, content = everyBlock) =>
	submit(context, '/notes/new', { title: 'Type', body: docOf(content) });

const newPost = (context: BrowserContext, content = everyBlock) =>
	submit(context, `/projects/${project.id}/new?/publish`, { title: 'Type', body: docOf(content) });

const live = (page: Page) => page.locator('[role="status"][data-status="live"]');

/** A note's body, once its editor has connected. */
async function openNote(context: BrowserContext, path: string) {
	const page = await context.newPage();
	await page.goto(path, { waitUntil: 'networkidle' });
	await expect(live(page)).toBeVisible();
	return page;
}

/** A note's body as it paints before the editor connects: a socket that never opens. */
async function openNoteConnecting(context: BrowserContext, path: string) {
	const page = await context.newPage();
	await page.addInitScript(() => {
		window.WebSocket = class extends EventTarget {
			readyState = 0;
			send() {}
			close() {}
		} as unknown as typeof WebSocket;
	});
	await page.goto(path);
	await expect(page.locator('.painted .prose')).toBeVisible();
	return page;
}

/** Puts `content` in the editor behind `box`, as typing and pasting would. */
const setDoc = (box: Locator, content: object[]) =>
	box.evaluate(
		(element, doc) =>
			(
				element as unknown as { editor: { commands: { setContent(doc: object): boolean } } }
			).editor.commands.setContent({ type: 'doc', content: doc }),
		content
	);

const styleOf = (target: Locator, ...properties: string[]): Promise<Record<string, string>> =>
	target.evaluate((element, names) => {
		const style = getComputedStyle(element) as unknown as Record<string, string>;
		return Object.fromEntries(names.map((name) => [name, style[name]]));
	}, properties);

const px = (value: string) => parseFloat(value);

/** What `value` (a colour or a var()) resolves to on this page, written as the browser writes colours. */
const resolve = (page: Page, property: 'color' | 'fontSize' | 'lineHeight', value: string) =>
	page.evaluate(
		([name, css]) => {
			const probe = document.createElement('span');
			(probe.style as unknown as Record<string, string>)[name] = css;
			document.body.appendChild(probe);
			const resolved = (getComputedStyle(probe) as unknown as Record<string, string>)[name];
			probe.remove();
			return resolved;
		},
		[property, value]
	);

/** `value` for `property` on a probe set in `size`. */
const resolveAt = (page: Page, property: 'lineHeight', value: string, size: string) =>
	page.evaluate(
		([name, css, fontSize]) => {
			const probe = document.createElement('span');
			probe.style.fontSize = fontSize;
			(probe.style as unknown as Record<string, string>)[name] = css;
			document.body.appendChild(probe);
			const resolved = (getComputedStyle(probe) as unknown as Record<string, string>)[name];
			probe.remove();
			return resolved;
		},
		[property, value, size]
	);

const rem = (page: Page) =>
	page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));

/** The top of each of the first five blocks of `prose`, in page coordinates. */
const tops = (prose: Locator) =>
	prose.evaluate((element) =>
		[...element.children]
			.slice(0, 5)
			.map((child) => Math.round(child.getBoundingClientRect().top + scrollY))
	);

for (const [profile, { use, touch }] of Object.entries(profiles)) {
	const bodySize = touch ? 16 : 15;
	const bodyLine = touch ? 24 : 23;

	test.describe(profile, () => {
		let context: BrowserContext;
		let notePath: string;
		let postPath: string;
		test.beforeAll(async ({ browser }) => {
			context = await signIn(browser, use);
			notePath = (await newNote(context))!;
			postPath = (await newPost(context))!;
		});
		test.afterAll(() => context.close());

		test(`the composer and the post it makes compute ${bodySize}px on ${bodyLine}px`, async () => {
			const composer = await context.newPage();
			await composer.goto(`/projects/${project.id}/new`, { waitUntil: 'networkidle' });
			const typed = await styleOf(
				composer.locator('.composer-card .ProseMirror'),
				'fontSize',
				'lineHeight'
			);
			const read = await context.newPage();
			await read.goto(postPath, { waitUntil: 'networkidle' });
			const rendered = await styleOf(
				read.locator('.prose[data-size="post"]').first(),
				'fontSize',
				'lineHeight'
			);
			expect(typed).toEqual({ fontSize: `${bodySize}px`, lineHeight: `${bodyLine}px` });
			expect(rendered).toEqual(typed);
		});

		test('a live note is 16px on 24px in the editor and as first painted, and nothing moves on connect', async () => {
			const connecting = await openNoteConnecting(context, notePath);
			const painted = connecting.locator('.painted .prose');
			const paintedType = await styleOf(painted, 'fontSize', 'lineHeight');
			const paintedTops = await tops(painted);
			const ready = await openNote(context, notePath);
			const editor = ready.locator('.body .ProseMirror');
			const editorType = await styleOf(editor, 'fontSize', 'lineHeight');
			const editorTops = await tops(editor);
			expect(paintedType).toEqual({ fontSize: '16px', lineHeight: '24px' });
			expect(editorType).toEqual({ fontSize: '16px', lineHeight: '24px' });
			expect(editorTops).toHaveLength(5);
			for (const [index, top] of editorTops.entries()) {
				expect(Math.abs(top - paintedTops[index]), `block ${index + 1} moved`).toBeLessThanOrEqual(
					1
				);
			}
		});

		test('a note holds 40em and a post 36em; comments and chat keep their column', async () => {
			const measure = async (page: Page, selector: string, size: number, em: number) => {
				const { maxWidth } = await styleOf(page.locator(selector).first(), 'maxWidth');
				expect(maxWidth, selector).toBe(`${size * em}px`);
			};
			const note = await openNote(context, notePath);
			await measure(note, '.body .ProseMirror', 16, 40);
			const connecting = await openNoteConnecting(context, notePath);
			await measure(connecting, '.painted .prose', 16, 40);

			const post = await context.newPage();
			await post.goto(postPath, { waitUntil: 'networkidle' });
			await measure(post, '.prose[data-size="post"]', bodySize, 36);
			const comment = await context.newPage();
			await comment.goto(`/posts/${posts.packing.id}`, { waitUntil: 'networkidle' });
			expect(
				(await styleOf(comment.locator('.prose[data-size="compact"]').first(), 'maxWidth')).maxWidth
			).toBe('none');
			const chat = await context.newPage();
			await chat.goto(`/chat/${threads.bo.id}`, { waitUntil: 'networkidle' });
			expect(
				(await styleOf(chat.locator('.prose[data-size="compact"]').first(), 'maxWidth')).maxWidth
			).toBe('none');

			const edit = await context.newPage();
			await edit.goto(`${postPath}/edit`, { waitUntil: 'networkidle' });
			await measure(edit, '.composer-card .ProseMirror', bodySize, 36);

			const draft = await context.newPage();
			await draft.goto(`/projects/${project.id}/new`, { waitUntil: 'networkidle' });
			await measure(draft, '.composer-card .ProseMirror', bodySize, 36);
			await draft.getByRole('textbox', { name: 'Title' }).fill('Type draft');
			await draft.keyboard.press('Escape');
			await expect(draft.getByText('Draft saved')).toBeVisible();
			await draft.goto('/drafts', { waitUntil: 'networkidle' });
			await draft.getByRole('link', { name: 'Type draft' }).first().click();
			await draft.waitForURL(/\/drafts\//);
			await draft.waitForLoadState('networkidle');
			await measure(draft, '.composer-card .ProseMirror', bodySize, 36);

			if (!touch) {
				await draft.goto(`/projects/${project.id}/new`, { waitUntil: 'networkidle' });
				await draft.getByRole('button', { name: 'Expand' }).click();
				await measure(draft, '.composer-card .ProseMirror', bodySize, 36);
				const prose = await draft.locator('.composer-card .ProseMirror').boundingBox();
				const subject = await draft.locator('.composer-card .subject input').boundingBox();
				const panel = await draft.getByRole('dialog').boundingBox();
				expect(
					Math.abs(subject!.x - prose!.x),
					'subject and body start together'
				).toBeLessThanOrEqual(1);
				const centre = (box: { x: number; width: number }) => box.x + box.width / 2;
				expect(
					Math.abs(centre(prose!) - centre(panel!)),
					'the line is centred'
				).toBeLessThanOrEqual(1);
			}
		});

		test('a rendered comment and the one just sent keep the column', async () => {
			const page = await context.newPage();
			await page.goto(`/posts/${posts.packing.id}`, { waitUntil: 'networkidle' });
			const read = await styleOf(page.locator('.comment .prose').first(), 'maxWidth');
			expect(read.maxWidth, 'a comment in the thread').toBe('none');

			// Hold the save, so the comment stays in its just-sent place.
			await page.route('**/*', (route) => {
				const request = route.request();
				return request.method() === 'POST' && request.url().endsWith('?/comment')
					? new Promise(() => {})
					: route.fallback();
			});
			await page.locator('[aria-label="Write a comment…"]').click();
			await page.keyboard.type('A comment on its way');
			await page.locator('button.suede-button', { hasText: 'Comment' }).click();
			const sent = page.locator('.sent .prose');
			await expect(sent).toBeVisible();
			expect((await styleOf(sent, 'maxWidth')).maxWidth, 'a comment just sent').toBe('none');
		});

		test('note headings compute the scale, and their space', async () => {
			const page = await openNote(context, notePath);
			const base = await rem(page);
			const editor = page.locator('.body .ProseMirror');
			const scale = [
				{ tag: 'h1', size: 'var(--text-3xl)', above: 2.25 },
				{ tag: 'h2', size: 'var(--text-2xl)', above: 2.25 },
				{ tag: 'h3', size: 'var(--text-lg)', above: 1.5 }
			];
			for (const { tag, size, above } of scale) {
				const heading = editor.locator(tag).first();
				const style = await styleOf(heading, 'fontSize', 'lineHeight', 'marginTop', 'fontWeight');
				expect(style.fontSize, `${tag} size`).toBe(await resolve(page, 'fontSize', size));
				// --leading-tight is a length that grows with the size, so read it at this heading's size.
				expect(style.lineHeight, `${tag} line`).toBe(
					await resolveAt(page, 'lineHeight', 'var(--leading-tight)', style.fontSize)
				);
				expect(style.fontWeight).toBe('700');
				expect(px(style.marginTop), `${tag} space above`).toBeCloseTo(above * base, 1);
				const next = await styleOf(heading.locator('xpath=following-sibling::*[1]'), 'marginTop');
				expect(px(next.marginTop), `${tag} space below`).toBeCloseTo(0.375 * base, 1);
			}
			const h2 = await styleOf(editor.locator('h2'), 'fontSize');
			expect(h2.fontSize).toBe(await resolve(page, 'fontSize', 'var(--text-2xl)'));
			// The scale's fluid step is 20px at 390 wide, within half a pixel.
			if (touch) expect(px(h2.fontSize)).toBeCloseTo(20, 0);

			// The editor has no fourth level; a note read elsewhere can, so set one in a rendered body.
			const rendered = await openNoteConnecting(context, notePath);
			const prose = rendered.locator('.painted .prose');
			await prose.evaluate((element) =>
				element.insertAdjacentHTML('beforeend', '<p>Above</p><h4>Heading four</h4><p>Below</p>')
			);
			const h4 = await styleOf(prose.locator('h4'), 'fontSize', 'marginTop', 'fontWeight');
			expect(h4.fontSize).toBe('16px');
			expect(h4.fontWeight).toBe('700');
			expect(px(h4.marginTop)).toBeCloseTo(1.5 * base, 1);
		});

		test('code blocks are 0.875em, never 12px', async () => {
			const note = await openNote(context, notePath);
			const inNote = await styleOf(
				note.locator('.body .ProseMirror pre'),
				'fontSize',
				'lineHeight'
			);
			expect(inNote.fontSize).toBe('14px');
			expect(inNote.lineHeight).toBe('22px');
			const post = await context.newPage();
			await post.goto(postPath, { waitUntil: 'networkidle' });
			const inPost = await styleOf(post.locator('.prose[data-size="post"] pre'), 'fontSize');
			expect(px(inPost.fontSize)).toBeCloseTo(0.875 * bodySize, 2);
			expect(Math.round(px(inPost.fontSize))).toBe(touch ? 14 : 13);
		});

		test('a quote is the colour of its paragraph, with the focus edge as its bar', async () => {
			const post = await context.newPage();
			await post.goto(postPath, { waitUntil: 'networkidle' });
			for (const page of [await openNote(context, notePath), post]) {
				const prose = page.locator('.prose:not([data-size="compact"])').first();
				const paragraph = await styleOf(prose.locator('p').first(), 'color');
				const quote = await styleOf(
					prose.locator('blockquote'),
					'color',
					'borderInlineStartColor',
					'borderInlineStartWidth'
				);
				expect(quote.color).toBe(paragraph.color);
				expect(quote.borderInlineStartColor).toBe(
					await resolve(page, 'color', 'var(--hue-field-edge-focus)')
				);
				expect(quote.borderInlineStartWidth).toBe('2px');
			}
		});

		test('lists indent 1.5em, sit 0.25lh apart, and numbers line up', async () => {
			const page = await openNote(context, notePath);
			const editor = page.locator('.body .ProseMirror');
			for (const tag of ['ul', 'ol']) {
				const list = await styleOf(editor.locator(tag).first(), 'paddingInlineStart', 'fontSize');
				expect(px(list.paddingInlineStart), `${tag} indent`).toBeCloseTo(
					1.5 * px(list.fontSize),
					1
				);
			}
			const ordered = await styleOf(editor.locator('ol').first(), 'fontVariantNumeric');
			expect(ordered.fontVariantNumeric).toBe('tabular-nums');
			const second = await styleOf(editor.locator('ul li').nth(1), 'marginTop', 'lineHeight');
			expect(px(second.marginTop)).toBeCloseTo(0.25 * px(second.lineHeight), 1);
		});

		test('no sideways scroll at 375 and 390 with a 200-character word and a code line', async ({
			browser
		}) => {
			test.skip(!touch, 'sizes its own phone screens');
			for (const width of [375, 390]) {
				const small = await signIn(browser, {
					viewport: { width, height: 844 },
					isMobile: true,
					hasTouch: true,
					...liveContext
				});
				const surfaces: [string, string, string | null][] = [
					['note', notePath, null],
					['post', postPath, null],
					['new note', '/notes/new', '.ProseMirror'],
					['post composer', `/projects/${project.id}/new`, '.composer-card .ProseMirror'],
					['post edit', `${postPath}/edit`, null]
				];
				for (const [name, path, box] of surfaces) {
					const page = await small.newPage();
					await page.goto(path, { waitUntil: 'networkidle' });
					if (box) await setDoc(page.locator(box), everyBlock);
					const { scrollWidth, innerWidth } = await page.evaluate(() => ({
						scrollWidth: document.documentElement.scrollWidth,
						innerWidth: window.innerWidth
					}));
					expect(scrollWidth, `${name} at ${width}`).toBe(innerWidth);
					await page.close();
				}
				await small.close();
			}
		});
	});
}
