import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet, mount, unmount } from 'svelte';
import Dialog from '#lib/components/ui/Dialog.svelte';
import Editor from './Editor.svelte';

vi.mock('$app/state', () => ({ page: { data: { timeZone: 'UTC' } } }));

const props = { name: 'body', placeholder: 'Write something', members: [], checklists: true };
const box = () => page.getByRole('textbox', { name: 'Write something' });
const list = () => page.getByRole('listbox', { name: 'Formatting and inserts' });
const option = (name: string) => page.getByRole('option', { name, exact: true });

/** The document as the form would send it. */
const saved = () =>
	JSON.parse(
		JSON.stringify(
			(
				document.querySelector('.ProseMirror') as HTMLElement & { editor: { getJSON(): object } }
			).editor.getJSON()
		)
	);

async function type(text: string) {
	await box().click();
	await userEvent.keyboard(text);
}

describe('the / menu', () => {
	it('opens on / in a note and in a post box, and /h2 then Enter makes a Heading 2 without the typed text', async () => {
		for (const kind of [{ note: true }, { bubble: true }]) {
			const { unmount } = render(Editor, { ...props, slash: 'document', ...kind });
			await type('/h2');
			await expect.element(list()).toBeVisible();
			await userEvent.keyboard('{Enter}');
			await expect.element(list()).not.toBeInTheDocument();
			expect(saved().content).toEqual([
				{ type: 'heading', attrs: { level: 2 } },
				{ type: 'paragraph' }
			]);
			unmount();
		}
	});

	it('makes each block from the keyboard, in a note', async () => {
		const blocks: [string, string, object?][] = [
			['/plain', 'paragraph'],
			['/h1', 'heading', { level: 1 }],
			['/h2', 'heading', { level: 2 }],
			['/h3', 'heading', { level: 3 }],
			['/bullet', 'bulletList'],
			['/numbered', 'orderedList'],
			['/todo', 'taskList'],
			['/blockquote', 'blockquote'],
			['/snippet', 'codeBlock'],
			['/hr', 'horizontalRule'],
			['/toggle', 'details']
		];
		for (const [typed, type_, attrs] of blocks) {
			const { unmount } = render(Editor, { ...props, slash: 'document', note: true });
			await type(typed);
			await userEvent.keyboard('{Enter}');
			const first = saved().content[0];
			expect(first.type, typed).toBe(type_);
			if (attrs) expect(first.attrs, typed).toMatchObject(attrs);
			unmount();
		}
	});

	it('offers Collapsible section in a post box too, and makes one', async () => {
		render(Editor, { ...props, slash: 'document', bubble: true });
		await type('/');
		await expect.element(option('Collapsible section')).toBeVisible();
		await userEvent.keyboard('toggle{Enter}');
		expect(saved().content[0].type).toBe('details');
	});

	it('puts a time at the caret from /time, in the paragraph that holds the words before it', async () => {
		render(Editor, { ...props, slash: 'document', bubble: true });
		await type('Call at /time');
		await userEvent.keyboard('{Enter}');
		const [first, ...rest] = saved().content[0].content;
		expect(first).toEqual({ type: 'text', text: 'Call at ' });
		expect(rest[0]).toMatchObject({ type: 'relativeTime' });
		expect(Number.isSafeInteger(rest[0].attrs.timestamp)).toBe(true);
		expect(saved().content, 'no block below').toHaveLength(1);
	});

	it('moves with the arrow keys, wrapping', async () => {
		render(Editor, { ...props, slash: 'document', note: true });
		await type('/');
		const text = option('Text');
		const last = option('Mention someone');
		await expect.element(text).toHaveAttribute('aria-selected', 'true');

		await userEvent.keyboard('{ArrowUp}');
		await expect.element(last).toHaveAttribute('aria-selected', 'true');

		await userEvent.keyboard('{ArrowDown}');
		await expect.element(text).toHaveAttribute('aria-selected', 'true');
	});

	it('names the active option on the editor, and stops when it closes', async () => {
		render(Editor, { ...props, slash: 'document', note: true });
		await type('/');
		const text = option('Text');
		const last = option('Mention someone');
		await expect.element(text).toBeVisible();
		await expect.element(box()).toHaveAttribute('aria-activedescendant', text.element().id);

		await userEvent.keyboard('{ArrowUp}');
		await expect.element(last).toHaveAttribute('aria-selected', 'true');
		await expect.element(box()).toHaveAttribute('aria-activedescendant', last.element().id);
		await userEvent.keyboard('{Escape}');
		await expect.element(box()).not.toHaveAttribute('aria-activedescendant');
	});

	it.each([
		['Bulleted list', '- ', '/bullet', 'bulletList'],
		['Numbered list', '1. ', '/numbered', 'orderedList'],
		// `[` starts a key descriptor, so a literal one is typed as `[[`.
		['Checklist', '[[ ] ', '/todo', 'taskList']
	])(
		'leaves the list as it is when %s is picked in an item of that list',
		async (_name, start, typed, kind) => {
			for (const words of ['', 'Tents ']) {
				const { unmount } = render(Editor, { ...props, slash: 'document', note: true });
				await type(`${start}${words}`);
				const before = saved();
				expect(before.content[0].type, start).toBe(kind);
				await userEvent.keyboard(`${typed}{Enter}`);
				expect(saved(), `${typed} after "${words}"`).toEqual(before);
				unmount();
			}
		}
	);

	it('closes on Escape and leaves what was typed', async () => {
		render(Editor, { ...props, slash: 'document', note: true });
		await type('/he');
		await expect.element(list()).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.element(list()).not.toBeInTheDocument();
		expect(saved().content[0].content[0].text).toBe('/he');
	});

	it('picks the item that is clicked', async () => {
		render(Editor, { ...props, slash: 'document', note: true });
		await type('/');
		await option('Heading 3').click();
		expect(saved().content[0]).toEqual({ type: 'heading', attrs: { level: 3 } });
	});

	it('opens after a line break in a block', async () => {
		render(Editor, { ...props, slash: 'document', note: true });
		await type('Intro');
		await userEvent.keyboard('{Shift>}{Enter}{/Shift}/');
		await expect.element(list()).toBeVisible();
	});

	it('puts the block below when the block already has text', async () => {
		render(Editor, { ...props, slash: 'document', note: true });
		await type('Intro /quote');
		await userEvent.keyboard('{Enter}');
		// The editor keeps an empty paragraph after a last block that isn't one.
		expect(saved().content).toEqual([
			{ type: 'paragraph', content: [{ type: 'text', text: 'Intro ' }] },
			{ type: 'blockquote', content: [{ type: 'paragraph' }] },
			{ type: 'paragraph' }
		]);
	});

	it('shows No results for text nothing matches, and a space closes it', async () => {
		render(Editor, { ...props, slash: 'document', note: true });
		await type('/zzz');
		await expect.element(page.getByText('No results')).toBeVisible();
		await userEvent.keyboard(' ');
		await expect.element(page.getByText('No results')).not.toBeInTheDocument();
	});

	it('does not open in the middle of a word or in code', async () => {
		render(Editor, { ...props, slash: 'document', note: true });
		await type('and/or');
		await expect.element(list()).not.toBeInTheDocument();

		await userEvent.keyboard(' /snippet{Enter}/');
		expect(saved().content[1].type).toBe('codeBlock');
		await expect.element(list()).not.toBeInTheDocument();
	});

	it("is on top inside a dialog: a pointer at an option's centre reaches the option", async () => {
		// A modal dialog turns off pointer events on the page behind it, so a menu on the body is unreachable.
		const children = createRawSnippet(() => ({
			render: () => '<div></div>',
			setup: (host) => {
				const editor = mount(Editor, {
					target: host,
					props: { ...props, slash: 'document', bubble: true }
				});
				return () => unmount(editor);
			}
		}));
		render(Dialog, { open: true, title: 'New thread', bare: true, size: '3xl', children });
		await type('/');
		await expect.element(option('Text')).toBeVisible();
		const first = option('Text').element();
		const { x, y, width, height } = first.getBoundingClientRect();
		const hit = document.elementFromPoint(x + width / 2, y + height / 2);
		expect(first.contains(hit), 'the option, not the dialog or its backdrop').toBe(true);
	});

	it('is not in a box that did not ask for it', async () => {
		render(Editor, { ...props, compact: true });
		await type('/');
		await expect.element(list()).not.toBeInTheDocument();
	});

	it('takes Enter before chat’s send', async () => {
		const send = vi.fn();
		render(Editor, { ...props, compact: true, slash: 'document', onenter: send });
		await type('/h2');
		await userEvent.keyboard('{Enter}');
		expect(send).not.toHaveBeenCalled();
		expect(saved().content[0].type).toBe('heading');
	});
});
