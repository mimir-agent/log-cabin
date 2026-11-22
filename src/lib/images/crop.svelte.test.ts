import { describe, expect, it } from 'vitest';
import { cropRect, renderCrop } from './crop';

// A 300 × 100 picture: red, green and blue thirds.
async function stripes(): Promise<HTMLImageElement> {
	const canvas = document.createElement('canvas');
	canvas.width = 300;
	canvas.height = 100;
	const context = canvas.getContext('2d')!;
	['#ff0000', '#00ff00', '#0000ff'].forEach((colour, i) => {
		context.fillStyle = colour;
		context.fillRect(i * 100, 0, 100, 100);
	});
	const image = new Image();
	image.src = canvas.toDataURL('image/png');
	await image.decode();
	return image;
}

async function pixels(blob: Blob) {
	const bitmap = await createImageBitmap(blob);
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const context = canvas.getContext('2d')!;
	context.drawImage(bitmap, 0, 0);
	const at = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data.slice(0, 3)];
	return { width: bitmap.width, height: bitmap.height, at };
}

describe('the saved crop', () => {
	it.each([
		['the middle', 0.5, [0, 255, 0]],
		['the left edge', 0, [255, 0, 0]],
		['the right edge', 1, [0, 0, 255]]
	])('of a square at %s is that third of the picture, at the output size', async (_, x, rgb) => {
		const image = await stripes();
		const rect = cropRect({ width: 300, height: 100 }, 1, { centerX: x, centerY: 0.5, zoom: 1 });
		const saved = await pixels(
			await renderCrop(image, rect, { width: 64, height: 64 }, 'image/png')
		);
		expect([saved.width, saved.height]).toEqual([64, 64]);
		for (const [px, py] of [
			[2, 2],
			[32, 32],
			[61, 61]
		]) {
			expect(saved.at(px, py), `pixel ${px},${py}`).toEqual(rgb);
		}
	});
});
