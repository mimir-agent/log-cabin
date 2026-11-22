import { describe, expect, it } from 'vitest';
import { attachmentPath, type DocNode } from '#lib/editor/doc.js';
import { documentSchema } from '#lib/editor/extensions.js';
import { galleryRanges } from './gallery';

const image = (id: string): DocNode => ({
	type: 'image',
	attrs: { src: attachmentPath(id.padEnd(26, '0')), alt: id }
});
const empty: DocNode = { type: 'paragraph' };
const words: DocNode = { type: 'paragraph', content: [{ type: 'text', text: 'Camp' }] };

/** The alt text of each tile, and how many gaps, for a document of these blocks. */
function gallery(...content: DocNode[]) {
	const doc = documentSchema().nodeFromJSON({ type: 'doc', content });
	const { tiles, gaps } = galleryRanges(doc);
	return {
		tiles: tiles.map((r) => doc.nodeAt(r.from)!.attrs.alt as string),
		gaps: gaps.length
	};
}

describe('the note editor’s galleries', () => {
	it('tiles two or more images in a row, across the empty paragraphs the editor puts after each', () => {
		expect(gallery(image('A'), empty, image('B'), empty, words)).toEqual({
			tiles: ['A', 'B'],
			gaps: 1
		});
		expect(gallery(image('A'), image('B'), image('C'))).toEqual({
			tiles: ['A', 'B', 'C'],
			gaps: 0
		});
	});

	it('leaves a lone image, and images split by text, as they are', () => {
		expect(gallery(image('A'), empty, words)).toEqual({ tiles: [], gaps: 0 });
		expect(gallery(image('A'), words, image('B'))).toEqual({ tiles: [], gaps: 0 });
	});

	it('keeps the same runs RichText shows as galleries', () => {
		expect(gallery(words, image('A'), empty, image('B'), words, image('C'), image('D'))).toEqual({
			tiles: ['A', 'B', 'C', 'D'],
			gaps: 1
		});
	});
});

describe('reordering a note’s files', () => {
	it('lets images and files be dragged, so a drag moves them in the document', () => {
		const { nodes } = documentSchema();
		expect(nodes.image.spec.draggable, 'an image').toBe(true);
		expect(nodes.attachment.spec.draggable, 'a file').toBe(true);
	});
});
