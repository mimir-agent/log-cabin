import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import { documentSchema } from '#lib/editor/extensions.js';
import { bodyField } from '#lib/notes/live.js';
import type { NoteConnection } from '#lib/notes/connection.js';
import { editorExtensions, mentionSuggestion } from './extensions';
import { liveExtensions } from './live-extensions';
import { noteExtensions } from './note-extensions';

const imageId = '01JD5Z3W8Q9X2M4N6P7R8S9T0V';

/** A live note Bo may edit, reading "Route:", with the cursor after the colon. */
function liveNote() {
	const doc = new Y.Doc();
	const body = {
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Route:' }] }]
	};
	prosemirrorJSONToYXmlFragment(documentSchema(), body, doc.getXmlFragment(bodyField));
	const live = {
		doc,
		awareness: new Awareness(doc),
		user: { id: 'bo', name: 'Bo', hue: 'blue' }
	} as unknown as NoteConnection;
	const element = document.body.appendChild(document.createElement('div'));
	const editor = new Editor({
		element,
		extensions: editorExtensions({
			placeholder: () => 'Write',
			mentionSuggestion: mentionSuggestion(() => []),
			checklists: false,
			live: liveExtensions(live, { onselect: () => {}, onopen: () => {} }),
			extra: noteExtensions(() => ({}), '/notes/N1/attachments')
		})
	});
	const paste = (text: string) => {
		const clipboardData = new DataTransfer();
		clipboardData.setData('text/plain', text);
		editor.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true }));
	};
	const done = () => {
		editor.destroy();
		element.remove();
	};
	return { editor, paste, done };
}

/** Stubs fetch to answer the import with this, once released; returns the mock and release. */
function importAnswers(answer: () => Response) {
	let release!: () => void;
	const released = new Promise<void>((resolve) => (release = resolve));
	const fetch = vi.fn(async () => {
		await released;
		return answer();
	});
	vi.stubGlobal('fetch', fetch);
	return { fetch, release };
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('pasting Markdown with a web image into a live note', () => {
	it('fetches the image into the note, showing nothing until it’s in, then pastes it as an image', async () => {
		const { editor, paste, done } = liveNote();
		await expect.poll(() => editor.getText()).toBe('Route:');
		editor.commands.setTextSelection(1 + 'Route:'.length);
		const { fetch, release } = importAnswers(() =>
			Response.json(
				{ id: imageId, name: 'a.png', size: 4, contentType: 'image/png' },
				{ status: 201 }
			)
		);

		paste('![the map](https://maps.example/a.png)');
		await expect.poll(() => fetch.mock.calls.length).toBe(1);
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('/notes/N1/attachments/from-url');
		expect(JSON.parse(String(init.body))).toEqual({ url: 'https://maps.example/a.png' });
		expect(editor.getJSON().content, 'nothing pasted while it imports').toHaveLength(1);

		release();
		await expect
			.poll(() => editor.getJSON().content?.find((node) => node.type === 'image'))
			.toMatchObject({
				type: 'image',
				attrs: { src: `/files/attachments/${imageId}`, alt: 'the map' }
			});
		expect(editor.getJSON().content?.[0], 'after the words it was pasted at').toMatchObject({
			type: 'paragraph',
			content: [{ text: 'Route:' }]
		});
		done();
	});

	it('pastes a link to the image, named by its alt text, when the note won’t take it', async () => {
		const { editor, paste, done } = liveNote();
		await expect.poll(() => editor.getText()).toBe('Route:');
		editor.commands.setTextSelection(1 + 'Route:'.length);
		const { release } = importAnswers(() =>
			Response.json({ message: 'not an image' }, { status: 415 })
		);

		paste('![the map](https://maps.example/a.png)');
		release();
		await expect.poll(() => editor.getText()).toContain('the map');
		const link = editor
			.getJSON()
			.content?.flatMap((node) => node.content ?? [])
			.find((node) => 'text' in node && node.text === 'the map');
		expect(link?.marks).toEqual([
			expect.objectContaining({
				type: 'link',
				attrs: expect.objectContaining({ href: 'https://maps.example/a.png' })
			})
		]);
		expect(
			editor.getJSON().content?.some((node) => node.type === 'image'),
			'no image pasted'
		).toBe(false);
		done();
	});

	it.each([403, 500])(
		'pastes a link to the image, and reports it, when the note answers %i',
		async (status) => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			const { editor, paste, done } = liveNote();
			await expect.poll(() => editor.getText()).toBe('Route:');
			editor.commands.setTextSelection(1 + 'Route:'.length);
			const { release } = importAnswers(() => Response.json({ message: 'no' }, { status }));

			paste('![the map](https://maps.example/a.png)');
			release();
			await expect.poll(() => editor.getText()).toContain('the map');
			expect(error, `the ${status} reported`).toHaveBeenCalledWith(
				expect.stringContaining(`answered ${status}`)
			);
			done();
		}
	);

	it('pastes a link to the image, and reports it, when the session ended and the answer is the sign-in page', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { editor, paste, done } = liveNote();
		await expect.poll(() => editor.getText()).toBe('Route:');
		editor.commands.setTextSelection(1 + 'Route:'.length);
		const { release } = importAnswers(
			() =>
				new Response('<html><body>Sign in</body></html>', {
					headers: { 'content-type': 'text/html' }
				})
		);

		paste('![the map](https://maps.example/a.png)');
		release();
		await expect.poll(() => editor.getText()).toContain('the map');
		expect(error, 'the 200 reported').toHaveBeenCalledWith(expect.stringContaining('answered 200'));
		done();
	});

	it('pastes a link to the image, without a report, when the note can’t be reached', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { editor, paste, done } = liveNote();
		await expect.poll(() => editor.getText()).toBe('Route:');
		editor.commands.setTextSelection(1 + 'Route:'.length);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('Failed to fetch');
			})
		);

		paste('![the map](https://maps.example/a.png)');
		await expect.poll(() => editor.getText()).toContain('the map');
		expect(error, 'offline is not worth a report').not.toHaveBeenCalled();
		done();
	});
});

describe('a link on a line of its own in a live note', () => {
	it('shows the page’s preview under it, and keeps the same card while the note changes', async () => {
		const { editor, paste, done } = liveNote();
		await expect.poll(() => editor.getText()).toBe('Route:');
		const fetch = vi.fn(async () =>
			Response.json({
				preview: {
					kind: 'page',
					url: 'https://camp.example/tents',
					title: 'Tents & tarps',
					description: null,
					image: null,
					domain: 'camp.example'
				}
			})
		);
		vi.stubGlobal('fetch', fetch);

		editor.commands.setTextSelection(1 + 'Route:'.length);
		editor.commands.splitBlock();
		paste('https://camp.example/tents');
		const card = () => editor.view.dom.querySelector('a.card');
		await expect.poll(() => card()?.textContent).toContain('Tents & tarps');
		expect(String(fetch.mock.calls[0])).toContain(
			`/link-preview?url=${encodeURIComponent('https://camp.example/tents')}`
		);

		const shown = card();
		editor.commands.insertContentAt(1, 'Day one ');
		expect(card(), 'the same card, not fetched again').toBe(shown);
		expect(fetch).toHaveBeenCalledTimes(1);
		done();
	});

	it('shows no card under a link with other words beside it', async () => {
		const { editor, paste, done } = liveNote();
		await expect.poll(() => editor.getText()).toBe('Route:');
		const fetch = vi.fn(async () => Response.json({ preview: null }));
		vi.stubGlobal('fetch', fetch);

		editor.commands.setTextSelection(1 + 'Route:'.length);
		paste(' https://camp.example/tents');
		await expect.poll(() => editor.getText()).toContain('camp.example');
		expect(fetch).not.toHaveBeenCalled();
		done();
	});
});
