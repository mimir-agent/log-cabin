// Pasted Markdown in every editor: a paste with every block syntax gives each surface its blocks and marks,
// and a rich HTML paste still gives the document the editor's own paste makes of it.
// `pnpm test:e2e` builds, starts the server (serve.ts) and runs this file.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { baseURL, crew, people, posts, project } from './fixtures.ts';
import { caretTaken, liveContext } from './editor.ts';

type Block = { type: string; attrs?: Record<string, unknown>; content?: { text?: string }[] };

const markdown = [
	'# Title',
	'## Sub',
	'- one',
	'1. first',
	'- [ ] task',
	'> quoted',
	'```js',
	'const a = 1;',
	'```',
	'**bold** _it_ `code` ~~gone~~ [link](https://example.com)',
	'---'
].join('\n');

const html =
	'<h2>Day</h2><ul><li>one</li></ul><ol><li>first</li></ol><p><strong>b</strong> <em>i</em> <s>s</s> <code>c</code> <a href="https://example.com">link</a></p><blockquote><p>quoted</p></blockquote><pre><code>x = 1</code></pre><hr>';
const htmlText = 'Day\none\nfirst\nb i s c link\nquoted\nx = 1';

/** Where each editor is, and what a task in it becomes: chat leaves tasks out, as bullets. */
const surfaces = [
	{
		name: 'post composer',
		url: `/projects/${project.id}/new`,
		box: /^Write something/,
		task: 'taskList'
	},
	{
		name: 'comment box',
		url: `/posts/${posts.packing.id}`,
		box: 'Write a comment…',
		task: 'taskList'
	},
	{ name: 'new note', url: '/notes/new', box: /^Write something/, task: 'taskList' },
	// A note of its own, so what is pasted into its live editor leaves the others' notes alone.
	{ name: 'note', url: null, box: /^Write something/, task: 'taskList' },
	{ name: 'chat composer', url: `/chat/${crew.id}`, box: 'Write a message…', task: 'bulletList' }
];

/** The editor's document, as much of it as a spec reads, less the empty paragraphs around a paste. */
const blocks = (box: Locator) =>
	box.evaluate((element) => {
		const { editor } = element as unknown as { editor: { getJSON(): { content?: Block[] } } };
		return (editor.getJSON().content ?? []).filter((n) => n.type !== 'paragraph' || n.content);
	});

/** Pastes `data` (clipboard types and their text) into the editor, as a browser does. */
const paste = (box: Locator, data: Record<string, string>) =>
	box.evaluate((element, data) => {
		const clipboardData = new DataTransfer();
		for (const [type, value] of Object.entries(data)) clipboardData.setData(type, value);
		element.dispatchEvent(
			new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
		);
	}, data);

async function open(page: Page, surface: (typeof surfaces)[number]) {
	let url = surface.url;
	if (url === null) {
		const created = await page.context().request.post('/notes/new', {
			form: {
				title: 'Paste scratch',
				body: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })
			},
			headers: { origin: baseURL, accept: 'text/html' },
			maxRedirects: 0
		});
		expect(created.status(), `/notes/new answered ${await created.text()}`).toBeLessThan(400);
		url = created.headers().location;
	}
	await page.goto(url, { waitUntil: 'networkidle' });
	if (surface.url === null) {
		await expect(page.getByRole('status').filter({ hasText: 'Connected' })).toBeVisible();
	}
	const box = page.getByRole('textbox', { name: surface.box });
	await box.click();
	await caretTaken(box);
	return box;
}

for (const surface of surfaces) {
	test.describe(surface.name, () => {
		test.use({ baseURL, ...liveContext });

		test.beforeEach(async ({ context }) => {
			await context.addCookies([
				{ name: 'campfire_session', value: people.ada.token, url: baseURL }
			]);
		});

		test('pasted Markdown becomes its blocks and marks', async ({ page }) => {
			const box = await open(page, surface);
			await paste(box, { 'text/plain': markdown });
			const doc = await blocks(box);
			expect(doc.map((node) => node.type)).toEqual([
				'heading',
				'heading',
				'bulletList',
				'orderedList',
				surface.task === 'taskList' ? 'taskList' : 'bulletList',
				'blockquote',
				'codeBlock',
				'paragraph',
				'horizontalRule'
			]);
			expect(doc[0]).toMatchObject({ attrs: { level: 1 } });
			expect(doc[6]).toMatchObject({
				attrs: { language: 'js' },
				content: [{ text: 'const a = 1;' }]
			});
			await expect(box.locator('strong', { hasText: 'bold' })).toBeVisible();
			await expect(box.locator('a[href="https://example.com"]', { hasText: 'link' })).toBeVisible();
		});

		test('rich HTML still pastes as its own blocks and marks', async ({ page }) => {
			const box = await open(page, surface);
			await paste(box, { 'text/html': html, 'text/plain': htmlText });
			expect((await blocks(box)).map((node) => node.type)).toEqual([
				'heading',
				'bulletList',
				'orderedList',
				'paragraph',
				'blockquote',
				'codeBlock',
				'horizontalRule'
			]);
			await expect(box.locator('h2', { hasText: 'Day' })).toBeVisible();
			await expect(box.locator('strong', { hasText: 'b' })).toBeVisible();
			await expect(box.locator('a[href="https://example.com"]', { hasText: 'link' })).toBeVisible();
		});
	});
}
