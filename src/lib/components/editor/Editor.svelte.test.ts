import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Editor from './Editor.svelte';
import type { DocNode } from '../../editor/doc';

vi.mock('$app/state', () => ({ page: { data: { timeZone: 'UTC' } } }));

const props = { name: 'body', placeholder: 'Write something', members: [] };
const paragraph = (...content: object[]) => ({ type: 'paragraph', content });

describe('Editor', () => {
	it('offers the Checklist tool only when asked to', async () => {
		render(Editor, { ...props, compact: true });
		await expect.element(page.getByRole('button', { name: 'Bold' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Checklist' })).not.toBeInTheDocument();
	});

	it('offers the Checklist tool where ticks are saved', async () => {
		render(Editor, { ...props, compact: true, checklists: true });
		await expect.element(page.getByRole('button', { name: 'Checklist' })).toBeVisible();
	});

	it('offers a collapsible section only in a note, and adds one that opens and closes', async () => {
		const { unmount } = render(Editor, props);
		await expect.element(page.getByRole('button', { name: 'Bold' })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Collapsible section' }))
			.not.toBeInTheDocument();
		unmount();

		render(Editor, { ...props, note: true });
		await page.getByRole('textbox', { name: 'Write something' }).click();
		await page.getByRole('button', { name: 'Collapsible section' }).click();
		await userEvent.keyboard('Packing');
		const toggle = page.getByRole('button', { name: 'Open section' });
		await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');
		await toggle.click();
		await expect
			.element(page.getByRole('button', { name: 'Close section' }))
			.toHaveAttribute('aria-expanded', 'true');
		const body = JSON.parse(
			(document.querySelector('input[name="body"]') as HTMLInputElement).value
		);
		expect(body.content[0], 'opening it changes nothing in the document').toEqual({
			type: 'details',
			content: [
				{ type: 'detailsSummary', content: [{ type: 'text', text: 'Packing' }] },
				{ type: 'detailsContent', content: [{ type: 'paragraph' }] }
			]
		});
	});

	it('inserts a date and time picked in the note toolbar, stored as its instant', async () => {
		render(Editor, { ...props, note: true });
		await page.getByRole('textbox', { name: 'Write something' }).click();
		await userEvent.keyboard('Meet ');
		await page.getByRole('button', { name: 'Date and time' }).click();
		await page.getByLabelText('When').fill('2030-01-02T09:30');
		await page.getByRole('button', { name: 'Insert' }).click();

		const box = page.getByRole('textbox', { name: 'Write something' }).element();
		await expect.poll(() => box.querySelector('time')?.textContent).toMatch(/^in \d+ years$/);
		const body = JSON.parse(
			(document.querySelector('input[name="body"]') as HTMLInputElement).value
		);
		expect(body.content[0].content[1]).toEqual({
			type: 'relativeTime',
			attrs: { timestamp: new Date('2030-01-02T09:30').getTime() }
		});
	});

	it('offers notes, posts and calls after people when @ is typed in a note, and inserts one without its title', async () => {
		const id = '01JD5Z3W8Q9X2M4N6P7R8S9T0V';
		const asked: string[] = [];
		vi.stubGlobal('fetch', async (url: string) => {
			asked.push(url);
			if (url.startsWith('/mentions/resources?')) {
				return Response.json({ items: [{ kind: 'post', id, title: 'Harbour budget' }] });
			}
			return Response.json({ title: 'Harbour budget', url: `/posts/${id}` });
		});
		render(Editor, { ...props, members: [{ id: 'u1', name: 'Bo Harbour' }], note: true });
		await page.getByRole('textbox', { name: 'Write something' }).click();
		await userEvent.keyboard('@harb');
		await expect.element(page.getByRole('option', { name: 'Bo Harbour' })).toBeVisible();
		await page.getByRole('option', { name: 'Harbour budget Thread' }).click();

		const box = page.getByRole('textbox', { name: 'Write something' }).element();
		await expect
			.poll(() => box.querySelector('a.resource-mention')?.getAttribute('href'))
			.toBe(`/posts/${id}`);
		expect(box.querySelector('a.resource-mention')!.textContent).toBe('Harbour budget');
		const body = JSON.parse(
			(document.querySelector('input[name="body"]') as HTMLInputElement).value
		);
		expect(body.content[0].content[0], 'kind and id only').toEqual({
			type: 'resourceMention',
			attrs: { kind: 'post', id }
		});
		expect(asked).toContain('/mentions/resources?q=harb');
		vi.unstubAllGlobals();
	});

	it('shows a mention’s title from the page without asking, and asks once for any other', async () => {
		const [known, other] = ['01JD5Z3W8Q9X2M4N6P7R8S9T0V', '01JD5Z3W8Q9X2M4N6P7R8S9T0W'];
		const asked: string[] = [];
		vi.stubGlobal('fetch', async (url: string) => {
			asked.push(url);
			return new Response('not found', { status: 404 });
		});
		const mention = (id: string) => ({ type: 'resourceMention', attrs: { kind: 'note', id } });
		render(Editor, {
			...props,
			note: true,
			value: {
				type: 'doc',
				content: [paragraph(mention(known), mention(other), mention(other))]
			} as DocNode,
			resources: { [`note:${known}`]: { title: 'Packing list', url: `/notes/${known}` } }
		});
		const box = page.getByRole('textbox', { name: 'Write something' });
		await expect.element(box.getByRole('link', { name: 'Packing list' })).toBeVisible();
		await expect.poll(() => box.getByText('Doc unavailable').elements().length).toBe(2);
		expect(asked, 'once, for the one the page didn’t have').toEqual([
			`/mentions/resources/note/${other}`
		]);
		vi.unstubAllGlobals();
	});

	it('marks selected text as a keyboard key from the note toolbar', async () => {
		render(Editor, { ...props, note: true });
		await page.getByRole('textbox', { name: 'Write something' }).click();
		await userEvent.keyboard('Esc{Shift>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}');
		await page.getByRole('button', { name: 'Keyboard key' }).click();
		const box = page.getByRole('textbox', { name: 'Write something' }).element();
		await expect.poll(() => box.querySelector('kbd')?.textContent).toBe('Esc');
	});

	it('turns straight quotes and double hyphens typographic in a note, and nowhere else', async () => {
		const typed = async (note: boolean, keys: string) => {
			const { unmount } = render(Editor, { ...props, note });
			const box = page.getByRole('textbox', { name: 'Write something' });
			await box.click();
			await userEvent.keyboard(keys);
			const written = box.element().textContent;
			unmount();
			return written;
		};
		expect(await typed(true, `"Camp" -- it's late`)).toBe('“Camp” — it’s late');
		expect(await typed(false, `"Camp" -- it's late`)).toBe(`"Camp" -- it's late`);
		expect(await typed(true, '```js a -- "b"'), 'code stays as typed').toBe('a -- "b"');
	});

	it('pastes Markdown code fences and images in a note as blocks, a web image as a link', async () => {
		const id = '01JD5Z3W8Q9X2M4N6P7R8S9T0V';
		render(Editor, { ...props, note: true });
		const box = page.getByRole('textbox', { name: 'Write something' });
		await box.click();
		const clipboardData = new DataTransfer();
		clipboardData.setData(
			'text/plain',
			`\`\`\`js\nconst a = 1;\n\`\`\`\n![tent](/files/attachments/${id})\n![map](https://maps.example/a.png)`
		);
		box.element().dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true }));

		const body = () =>
			JSON.parse((document.querySelector('input[name="body"]') as HTMLInputElement).value);
		await expect
			.poll(() => body().content[0])
			.toEqual({
				type: 'codeBlock',
				attrs: { language: 'js' },
				content: [{ type: 'text', text: 'const a = 1;' }]
			});
		const [, image, link] = body().content;
		expect(image).toMatchObject({ type: 'image', attrs: { src: `/files/attachments/${id}` } });
		expect(link.content[0]).toMatchObject({
			text: 'map',
			marks: [{ type: 'link', attrs: { href: 'https://maps.example/a.png' } }]
		});
	});

	it('shows a note’s card on resting on a link to it in a note being written', async () => {
		vi.stubGlobal('fetch', async (url: string) => {
			if (url !== '/notes/N1/card') throw new Error(`unexpected fetch of ${url}`);
			return Response.json({
				title: 'Hike plan',
				authorName: 'Ada',
				updatedAt: 0,
				thumbnailVersion: null
			});
		});
		const value = {
			type: 'doc',
			content: [
				paragraph({
					type: 'text',
					text: 'the plan',
					marks: [{ type: 'link', attrs: { href: 'https://campfire.test/notes/N1' } }]
				})
			]
		} as DocNode;
		render(Editor, { ...props, note: true, value });

		await userEvent.hover(page.getByRole('link', { name: 'the plan' }));
		await expect.element(page.getByLabelText('Hike plan')).toHaveTextContent('Ada · updated');
		vi.unstubAllGlobals();
	});

	it('highlights a code block typed with ``` in a note, and leaves posts plain', async () => {
		const typed = async (note: boolean) => {
			const { unmount } = render(Editor, { ...props, note });
			await page.getByRole('textbox', { name: 'Write something' }).click();
			await userEvent.keyboard('```js const x = 1;');
			const box = page.getByRole('textbox', { name: 'Write something' }).element();
			await expect.poll(() => box.querySelector('pre code')?.textContent).toBe('const x = 1;');
			const keyword = box.querySelector('pre .hljs-keyword')?.textContent ?? null;
			unmount();
			return keyword;
		};
		expect(await typed(true)).toBe('const');
		expect(await typed(false), 'no highlighting outside a note').toBeNull();
	});

	it('turns a typed "[ ] " into a checklist only where ticks are saved', async () => {
		const typed = async (checklists: boolean) => {
			const { unmount } = render(Editor, { ...props, checklists });
			await page.getByRole('textbox', { name: 'Write something' }).click();
			// "[[" types one "[" in user-event's key syntax.
			await userEvent.keyboard('[[ ] Tent');
			const boxes = page.getByRole('checkbox').elements().length;
			unmount();
			return boxes;
		};
		expect(await typed(false)).toBe(0);
		expect(await typed(true)).toBe(1);
	});

	it('turns a typed "- [ ] " and "- [x] " into task items only where ticks are saved', async () => {
		const typed = async (checklists: boolean) => {
			const { unmount } = render(Editor, { ...props, checklists });
			await page.getByRole('textbox', { name: 'Write something' }).click();
			await userEvent.keyboard('- [[ ] open{Enter}{Enter}- [[x] shut');
			const boxes = page.getByRole('checkbox').elements() as HTMLInputElement[];
			const checked = boxes.map((box) => box.checked);
			unmount();
			return checked;
		};
		expect(await typed(false)).toEqual([]);
		expect(await typed(true)).toEqual([false, true]);
	});

	it('turns a typed [text](url) into linked text when the ) is typed, if the address is allowed', async () => {
		render(Editor, props);
		const box = page.getByRole('textbox', { name: 'Write something' });
		await box.click();
		// javascript:void and ftp:// have no spaces or parentheses, so the input rule matches them
		// and linkHref is what refuses them.
		await userEvent.keyboard(
			'[[site](https://example.com) and [[x](javascript:void) and [[y](ftp://example.com)'
		);
		const [link, ...others] = box.element().querySelectorAll('a');
		expect(link.getAttribute('href')).toBe('https://example.com');
		expect(link.textContent).toBe('site');
		expect(others, 'the javascript: and ftp: addresses make no link').toEqual([]);
		expect(box.element().textContent).toBe(
			'site and [x](javascript:void) and [y](ftp://example.com)'
		);
	});

	it('shows the Link button’s name and its keys in a tooltip', async () => {
		render(Editor, props);
		await userEvent.hover(page.getByRole('button', { name: 'Link' }));
		const tip = page.getByRole('tooltip');
		await expect.element(tip, { timeout: 3000 }).toHaveTextContent('Link');
		await expect.element(tip).toHaveTextContent(/⌘K|Ctrl\+K/);
	});

	it('opens the link field on Ctrl+K at the selection, with or without formatting buttons', async () => {
		render(Editor, { ...props, formatting: false });
		const box = page.getByRole('textbox', { name: 'Write something' });
		await expect.element(page.getByRole('button', { name: 'Link' })).not.toBeInTheDocument();
		await box.click();
		await userEvent.keyboard(
			'hello world{Shift>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}'
		);
		await userEvent.keyboard('{Control>}k{/Control}');
		const field = page.getByRole('textbox', { name: 'Link address' });
		await expect.element(field).toHaveFocus();
		await expect
			.element(page.getByRole('textbox', { name: 'Link text' }), { timeout: 200 })
			.not.toBeInTheDocument();
		await field.fill('example.com');
		await userEvent.keyboard('{Enter}');
		await expect.poll(() => box.element().querySelector('a')?.textContent).toBe('world');
		expect(box.element().querySelector('a')?.getAttribute('href')).toBe('https://example.com');
	});

	it('asks for an address and optional text on Ctrl+K with nothing selected, and inserts the link', async () => {
		render(Editor, { ...props, formatting: false });
		const box = page.getByRole('textbox', { name: 'Write something' });
		await box.click();
		await userEvent.keyboard('see {Control>}k{/Control}');
		await page.getByRole('textbox', { name: 'Link address' }).fill('example.org');
		await page.getByRole('textbox', { name: 'Link text' }).fill('the site');
		await userEvent.keyboard('{Enter}');
		await expect.poll(() => box.element().querySelector('a')?.textContent).toBe('the site');
		expect(box.element().querySelector('a')?.getAttribute('href')).toBe('https://example.org');
	});

	it('marks everything typed after the Keyboard key button with nothing selected', async () => {
		render(Editor, { ...props, note: true });
		const box = page.getByRole('textbox', { name: 'Write something' });
		await box.click();
		await page.getByRole('button', { name: 'Keyboard key' }).click();
		await userEvent.keyboard('def');
		await expect.poll(() => box.element().querySelector('kbd')?.textContent).toBe('def');
	});

	it('takes a new placeholder as its name and hint, as the comment box does for a reply', async () => {
		const { rerender } = render(Editor, props);
		await rerender({ placeholder: 'Write a reply' });
		const box = page.getByRole('textbox', { name: 'Write a reply' });
		await expect.element(box).toBeVisible();
		expect(
			box.element().querySelector('[data-placeholder]')?.getAttribute('data-placeholder')
		).toBe('Write a reply');
	});

	it('shows formatting over selected text instead of in the toolbar when asked to', async () => {
		render(Editor, { ...props, bubble: true });
		await expect.element(page.getByRole('button', { name: 'Bold' })).not.toBeInTheDocument();
		await page.getByRole('textbox', { name: 'Write something' }).click();
		await userEvent.keyboard('Tents{Shift>}{Home}{/Shift}');
		await expect.element(page.getByRole('button', { name: 'Bold' })).toBeVisible();
	});

	it('sends on Enter and starts a new line on Shift+Enter, in chat', async () => {
		let sent = 0;
		render(Editor, { ...props, onenter: () => sent++ });
		const box = page.getByRole('textbox', { name: 'Write something' });
		await box.click();
		await userEvent.keyboard('Tents{Shift>}{Enter}{/Shift}Maps');
		expect(box.element().innerHTML).toBe('<p>Tents<br>Maps</p>');
		expect(sent).toBe(0);
		await userEvent.keyboard('{Enter}');
		expect(sent).toBe(1);
		expect(box.element().innerHTML).toBe('<p>Tents<br>Maps</p>');
	});

	it('picks a name from the mention list on Enter instead of sending', async () => {
		let sent = 0;
		const members = [{ id: 'u1', name: 'Ada' }];
		render(Editor, { ...props, members, onenter: () => sent++ });
		await page.getByRole('textbox', { name: 'Write something' }).click();
		await userEvent.keyboard('@Ad');
		await expect.element(page.getByRole('option', { name: 'Ada' })).toBeVisible();
		await userEvent.keyboard('{Enter}');
		expect(sent).toBe(0);
		await expect.element(page.getByText('@Ada')).toBeVisible();
	});

	it('names the active mention option on the editor, and stops when the list closes', async () => {
		const members = [
			{ id: 'u1', name: 'Ada' },
			{ id: 'u2', name: 'Adrian' }
		];
		render(Editor, { ...props, members });
		const box = page.getByRole('textbox', { name: 'Write something' });
		await box.click();
		await userEvent.keyboard('@Ad');
		const ada = page.getByRole('option', { name: 'Ada', exact: true });
		const adrian = page.getByRole('option', { name: 'Adrian', exact: true });
		await expect.element(ada).toBeVisible();
		await expect.element(box).toHaveAttribute('aria-activedescendant', ada.element().id);
		await userEvent.keyboard('{ArrowDown}');
		await expect.element(adrian).toHaveAttribute('aria-selected', 'true');
		await expect.element(box).toHaveAttribute('aria-activedescendant', adrian.element().id);
		await userEvent.keyboard('{Escape}');
		await expect.element(box).not.toHaveAttribute('aria-activedescendant');
	});

	it('asks to edit the last message on ArrowUp only while empty', async () => {
		let asked = 0;
		render(Editor, { ...props, onemptyarrowup: () => asked++ });
		await page.getByRole('textbox', { name: 'Write something' }).click();
		await userEvent.keyboard('{ArrowUp}');
		expect(asked).toBe(1);
		await userEvent.keyboard('Tents{ArrowUp}');
		expect(asked).toBe(1);
	});

	it('shows no toolbar when it has no tools to offer', async () => {
		render(Editor, { ...props, formatting: false });
		await expect.element(page.getByRole('textbox', { name: 'Write something' })).toBeVisible();
		await expect.element(page.getByRole('toolbar')).not.toBeInTheDocument();
	});
});
