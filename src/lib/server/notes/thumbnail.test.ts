import { describe, expect, it } from 'vitest';
import type { DocNode } from '../../editor/doc';
import { renderNoteThumbnails, thumbnailLines } from './thumbnail';

const text = (t: string) => ({ type: 'text', text: t });
const paragraph = (t: string) => ({ type: 'paragraph', content: [text(t)] });
const item = (t: string) => ({ type: 'listItem', content: [paragraph(t)] });

const body = {
	type: 'doc',
	content: [
		{ type: 'heading', attrs: { level: 2 }, content: [text('Day one')] },
		paragraph('Meet at the trailhead at seven. Bring water for the whole day.'),
		{ type: 'image', attrs: { src: '/files/attachments/a1', alt: 'Map' } },
		{ type: 'bulletList', content: [item('Tent'), item('Stove'), item('')] },
		{ type: 'attachment', attrs: { id: 'a2', name: 'permit.pdf' } },
		paragraph('')
	]
} as DocNode;

/** Width and height from a PNG's IHDR chunk, after checking the signature. */
function pngSize(png: Uint8Array) {
	expect([...png.subarray(0, 8)], 'the PNG signature').toEqual([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
	]);
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
	expect(new TextDecoder().decode(png.subarray(12, 16)), 'IHDR first').toBe('IHDR');
	return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe('a note thumbnail', () => {
	it('shows the text of headings, paragraphs and list items, and no images or files', () => {
		expect(thumbnailLines(body)).toEqual([
			'Day one',
			'Meet at the trailhead at seven. Bring water for the whole day.',
			'• Tent',
			'• Stove'
		]);
	});

	it('renders a note as a 1200×630 link preview and a 600×450 card', async () => {
		const thumbnails = await renderNoteThumbnails({ title: 'Hike plan', body });
		expect(pngSize(thumbnails.og)).toEqual({ width: 1200, height: 630 });
		expect(pngSize(thumbnails.grid)).toEqual({ width: 600, height: 450 });
	});

	it('renders an untitled, empty note too', async () => {
		const thumbnails = await renderNoteThumbnails({ title: '', body: { type: 'doc' } });
		expect(pngSize(thumbnails.grid)).toEqual({ width: 600, height: 450 });
	});
});
