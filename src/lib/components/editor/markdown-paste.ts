// Pasted Markdown as the blocks and marks it stands for, in every editor: the document's schema
// decides which of them the editor takes. A note's editor adds fetching pasted web images.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import {
	parseMarkdownPaste,
	pasteSlice,
	vscodePaste,
	type ImportedImages
} from '#lib/editor/markdown-paste.js';
import type { DocNode } from '#lib/editor/doc.js';

/** How a paste's web images get into a note: fetched while the selection is held in place. */
export type WebImages = {
	/** The selection's ends as of `state`, and a way to read them back once `fetch` is done. */
	hold: (state: EditorState) => (now: EditorState) => { from: number; to: number };
	/** Each address with the attachment path it was stored at; one that wasn't is left out. */
	fetch: (urls: string[]) => Promise<ImportedImages>;
};

/**
 * Pasted text becomes the blocks and marks of its Markdown, except inside code, and except for
 * Ctrl/Cmd+Shift+V, which pastes plain text. Text from a code editor becomes code, unless the
 * editor says it is Markdown. Rich HTML is left to the editor's own paste. With `web`, images at
 * web addresses are fetched first and nothing is inserted until they're in; one that fails
 * stays a link. The whole paste is one transaction, so one undo takes it back.
 */
export const MarkdownPaste = (web?: WebImages) =>
	Extension.create({
		name: 'markdownPaste',
		addProseMirrorPlugins() {
			const { editor } = this;
			const nodes = new Set(Object.keys(editor.schema.nodes));
			// Replaces the selection, or `range`, in one transaction.
			const insert = (blocks: DocNode[], range?: { from: number; to: number }) =>
				editor.commands.command(({ tr }) => {
					if (range) tr.setSelection(TextSelection.create(tr.doc, range.from, range.to));
					tr.replaceSelection(pasteSlice(editor.schema, blocks)).scrollIntoView();
					return true;
				});
			let shift = false;
			const track = (event: KeyboardEvent) => {
				shift = event.shiftKey;
				return false;
			};
			return [
				new Plugin({
					key: new PluginKey('markdownPaste'),
					props: {
						// A paste carries no keys, so Shift is read from the keys around it.
						handleDOMEvents: {
							keydown: (_view, event) => track(event),
							keyup: (_view, event) => track(event),
							blur: () => (shift = false)
						},
						handlePaste: (view, event) => {
							const data = event.clipboardData;
							if (!data || shift || view.state.selection.$from.parent.type.spec.code) return false;
							const text = data.getData('text/plain');
							const editorData = data.getData('vscode-editor-data');
							// Code editors put coloured HTML beside their text; other HTML is a rich paste.
							if (data.getData('text/html') && !editorData) return false;
							const mode = editorData
								? (JSON.parse(editorData) as { mode?: string }).mode
								: undefined;
							if (mode && mode !== 'markdown') {
								return editor.commands.insertContent(vscodePaste(text, mode));
							}
							const paste = parseMarkdownPaste(text, nodes);
							if (paste === null) return false;
							if (!web || paste.web.length === 0) return insert(paste.blocks());
							const place = web.hold(view.state);
							void web.fetch(paste.web).then((imported) => {
								insert(paste.blocks(imported), place(editor.state));
							});
							return true;
						}
					}
				})
			];
		}
	});
