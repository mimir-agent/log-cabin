import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import * as buf from 'lib0/buffer';
import { Awareness } from 'y-protocols/awareness';
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import { documentSchema } from '#lib/editor/extensions.js';
import { bodyField } from '#lib/notes/live.js';
import type { NoteConnection } from '#lib/notes/connection.js';
import { markComment } from '#lib/server/realtime/comment-marks.js';
import { editorExtensions, mentionSuggestion } from './extensions';
import { liveExtensions, type SelectedPassage } from './live-extensions';

const commentId = '01JD5Z3W8Q9X2M4N6P7R8S9T0V';

/** A read-only live editor on a note reading "Walk the ridge early", as a viewer has it. */
function readOnlyEditor() {
	const doc = new Y.Doc();
	const body = {
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Walk the ridge early' }] }]
	};
	prosemirrorJSONToYXmlFragment(documentSchema(), body, doc.getXmlFragment(bodyField));
	const live = {
		doc,
		awareness: new Awareness(doc),
		user: { id: 'cy', name: 'Cy', hue: 'blue' }
	} as unknown as NoteConnection;
	const selected: (SelectedPassage | null)[] = [];
	const opened: string[] = [];
	const element = document.body.appendChild(document.createElement('div'));
	const editor = new Editor({
		element,
		editable: false,
		extensions: editorExtensions({
			placeholder: () => 'Write',
			mentionSuggestion: mentionSuggestion(() => []),
			checklists: false,
			live: liveExtensions(live, {
				onselect: (passage) => selected.push(passage),
				onopen: (id) => opened.push(id)
			})
		})
	});
	return { doc, editor, element, selected, opened };
}

describe('commenting on words in a live note', () => {
	it('hands over the selected words so the hub marks those words, shown and opened from the text', async () => {
		const { doc, editor, element, selected, opened } = readOnlyEditor();
		await expect.poll(() => editor.getText()).toBe('Walk the ridge early');

		const from = 1 + 'Walk '.length;
		editor.commands.setTextSelection({ from, to: from + 'the ridge'.length });
		const passage = selected.at(-1);
		expect(passage, 'the selection was handed over').toMatchObject({
			start: expect.any(String),
			end: expect.any(String)
		});

		// What the hub does with them, on its own copy of the document.
		const hub = new Y.Doc();
		Y.applyUpdate(hub, Y.encodeStateAsUpdate(doc));
		const marked = markComment(
			hub,
			commentId,
			buf.fromBase64(passage!.start),
			buf.fromBase64(passage!.end),
			'hub'
		);
		expect(marked, 'the hub marks the passage').toBe(true);
		Y.applyUpdate(doc, Y.encodeStateAsUpdate(hub, Y.encodeStateVector(doc)));

		const words = `.note-comment[data-comment-id="${commentId}"]`;
		await expect.poll(() => element.querySelector(words)?.textContent).toBe('the ridge');
		await userEvent.click(element.querySelector<HTMLElement>(words)!);
		expect(opened).toEqual([commentId]);

		editor.commands.setTextSelection(from);
		expect(selected.at(-1), 'an empty selection is none').toBeNull();
		editor.destroy();
		element.remove();
	});
});
