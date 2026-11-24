// Live editing for a note's editor: the shared Yjs document and everyone's cursors. Kept apart
// from extensions.ts so that only the note page loads Yjs; post, comment and chat editors don't.
import { Extension, type AnyExtension } from '@tiptap/core';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { absolutePositionToRelativePosition, ySyncPluginKey } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import * as buf from 'lib0/buffer';
import type { Awareness } from 'y-protocols/awareness';
import type { NoteConnection } from '#lib/notes/connection.js';
import type { LiveUser } from '#lib/notes/live.js';
import { atMostEvery } from './own-cursor.js';

/**
 * Words selected in the note: where they end on screen (client coordinates, under the last
 * line), and their ends as the note's hub reads them, Y.RelativePositions encoded and base64,
 * which keep pointing at the same words while others edit.
 */
export type SelectedPassage = { top: number; left: number; start: string; end: string };

/** What the note page hears of comments' passages in its editor. */
export type CommentPassages = {
	/** Words were selected, or the selection went. */
	onselect: (passage: SelectedPassage | null) => void;
	/** Words a comment was made on were clicked. */
	onopen: (commentId: string, element: HTMLElement) => void;
};

/**
 * Another person's cursor: a coloured bar with their name above it. It and their selection
 * carry `data-hue`, the hue the server gave them, which sets the person colour tokens.
 */
function caret(user: LiveUser): HTMLElement {
	const bar = document.createElement('span');
	bar.className = 'live-caret';
	bar.dataset.hue = user.hue;
	const label = document.createElement('span');
	label.className = 'live-caret-name';
	label.textContent = user.name;
	bar.appendChild(label);
	return bar;
}

function selectedPassage(view: EditorView): SelectedPassage | null {
	const { selection } = view.state;
	if (!(selection instanceof TextSelection) || selection.empty) return null;
	const { type, mapping } = ySyncPluginKey.getState(view.state)!.binding;
	const encode = (pos: number) =>
		buf.toBase64(Y.encodeRelativePosition(absolutePositionToRelativePosition(pos, type, mapping)));
	const end = view.coordsAtPos(selection.to);
	return {
		top: end.bottom,
		left: end.left,
		start: encode(selection.from),
		end: encode(selection.to)
	};
}

/**
 * Tells the page about selected words and clicks on commented words, in a read-only editor
 * too. The page's selection going anywhere else counts as no selection.
 */
function commentPassages({ onselect, onopen }: CommentPassages): AnyExtension {
	return Extension.create({
		name: 'commentPassages',
		addProseMirrorPlugins: () => [
			new Plugin({
				view: (view) => {
					const left = () => {
						const selection = document.getSelection();
						if (!selection || selection.isCollapsed || !view.dom.contains(selection.anchorNode)) {
							onselect(null);
						}
					};
					document.addEventListener('selectionchange', left);
					return {
						update: (view, previous) => {
							if (view.state.doc === previous.doc && view.state.selection.eq(previous.selection)) {
								return;
							}
							onselect(selectedPassage(view));
						},
						destroy: () => document.removeEventListener('selectionchange', left)
					};
				},
				props: {
					handleDOMEvents: {
						click: (_view, event) => {
							const words = (event.target as Element).closest<HTMLElement>('[data-comment-id]');
							if (words) onopen(words.dataset.commentId!, words);
							return false;
						}
					}
				}
			})
		]
	});
}

/**
 * The cursor plugin redraws everyone's cursors on each awareness change, ours moving with every
 * key included, though it never draws ours. This awareness tells it only of changes that came
 * from others, which leaves a key one transaction instead of two.
 */
function changesFromOthers(awareness: Awareness) {
	type Listener = (changes: unknown, origin: unknown) => void;
	const wrapped = new Map<Listener, Listener>();
	return Object.assign(Object.create(awareness) as Awareness, {
		on(name: string, listener: Listener) {
			if (name !== 'change') return awareness.on(name, listener);
			const fromOthers: Listener = (changes, origin) => {
				if (origin !== 'local') listener(changes, origin);
			};
			wrapped.set(listener, fromOthers);
			awareness.on(name, fromOthers);
		},
		off(name: string, listener: Listener) {
			awareness.off(name, wrapped.get(listener) ?? listener);
			wrapped.delete(listener);
		}
	});
}

/**
 * The shared document and everyone's cursors, in place of the editor's own history, and with
 * what the page needs for comments on selected words.
 */
export function liveExtensions(live: NoteConnection, passages: CommentPassages): AnyExtension[] {
	return [
		Collaboration.configure({ document: live.doc }),
		CollaborationCaret.configure({
			provider: { awareness: atMostEvery(100, changesFromOthers(live.awareness)) },
			user: live.user,
			render: caret,
			selectionRender: (user: LiveUser) => ({ class: 'live-selection', 'data-hue': user.hue })
		}),
		commentPassages(passages)
	];
}
