import { describe, expect, it } from 'vitest';
import { cropEncoding, cropRect, dragView } from './crop';

const wide = { width: 3000, height: 1000 };
const tall = { width: 1000, height: 2000 };
const centre = { centerX: 0.5, centerY: 0.5, zoom: 1 };

describe('the crop', () => {
	it('starts as the largest piece of the shape that fits, in the middle', () => {
		expect(cropRect(wide, 1, centre)).toEqual({ x: 1000, y: 0, width: 1000, height: 1000 });
		expect(cropRect(tall, 3, centre)).toEqual({
			x: 0,
			y: 1000 - 1000 / 6,
			width: 1000,
			height: 1000 / 3
		});
	});

	it('zooms in around its centre', () => {
		expect(cropRect(wide, 1, { ...centre, zoom: 2 })).toEqual({
			x: 1250,
			y: 250,
			width: 500,
			height: 500
		});
	});

	it('never leaves the image, however far it is dragged', () => {
		const dragged = dragView(wide, 1, centre, 10_000, 0, 300);
		expect(cropRect(wide, 1, dragged)).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
	});

	it('moves the other way to the drag, by the frame’s scale', () => {
		// A 300 px frame shows 1000 image px: dragging 30 px right moves the crop 100 px left.
		const dragged = dragView(wide, 1, centre, 30, 0, 300);
		expect(cropRect(wide, 1, dragged).x).toBeCloseTo(900);
	});

	it.each([
		['cover', 'image/png', 'image/jpeg'],
		['avatar', 'image/png', 'image/png'],
		['avatar', 'image/webp', 'image/webp'],
		['logo', 'image/gif', 'image/png']
	] as const)('saves a %s picked as %s as %s', (shape, uploaded, saved) => {
		expect(cropEncoding(shape, uploaded)).toBe(saved);
	});
});
