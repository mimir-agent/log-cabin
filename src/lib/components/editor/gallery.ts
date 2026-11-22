// Galleries in the editor: two or more images in a row, as RichText groups them (withGalleries
// in doc.ts). ProseMirror can't wrap them in one element, so each image in a run is marked
// `gallery-tile` and the empty paragraphs between them `gallery-gap`, and Editor.svelte lays
// those out as one row of tiles.
import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

type Range = { from: number; to: number };

/** The tiles and in-between gaps of every run of two or more images among the top blocks. */
export function galleryRanges(doc: PMNode): { tiles: Range[]; gaps: Range[] } {
	const tiles: Range[] = [];
	const gaps: Range[] = [];
	let run: Range[] = [];
	let inner: Range[] = [];
	let gap: Range[] = [];
	const flush = () => {
		if (run.length >= 2) {
			tiles.push(...run);
			gaps.push(...inner);
		}
		run = [];
		inner = [];
		gap = [];
	};
	doc.forEach((node, offset) => {
		const range = { from: offset, to: offset + node.nodeSize };
		if (node.type.name === 'image') {
			inner.push(...gap);
			gap = [];
			run.push(range);
		} else if (run.length && node.type.name === 'paragraph' && node.childCount === 0) {
			gap.push(range);
		} else {
			flush();
		}
	});
	flush();
	return { tiles, gaps };
}

export const Gallery = Extension.create({
	name: 'gallery',
	addProseMirrorPlugins: () => [
		new Plugin({
			props: {
				decorations: (state) => {
					const { tiles, gaps } = galleryRanges(state.doc);
					return DecorationSet.create(state.doc, [
						...tiles.map((r) => Decoration.node(r.from, r.to, { class: 'gallery-tile' })),
						...gaps.map((r) => Decoration.node(r.from, r.to, { class: 'gallery-gap' }))
					]);
				}
			}
		})
	]
});
