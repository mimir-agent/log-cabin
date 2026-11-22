import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CanvasImage from './CanvasImage.svelte';

const image = `data:image/svg+xml,${encodeURIComponent(
	'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"></svg>'
)}`;

function renderPins(pins: { x: number; y: number; authorName: string; hue: string }[]) {
	const props = {
		src: image,
		alt: 'Tent plan',
		attachmentId: 'a1',
		pins: pins.map((pin, i) => ({ id: `c${i}`, number: i + 1, ...pin })),
		canPin: false,
		members: [],
		customEmoji: {},
		uploadUrl: '/projects/p1/attachments',
		viewerHue: 'blue'
	};
	return render(CanvasImage, props).container;
}

describe('canvas comment markers', () => {
	it('shows each commenter’s pin in their colour, with their initials', () => {
		const root = renderPins([
			{ x: 0.25, y: 0.5, authorName: 'Ada Lovelace', hue: 'teal' },
			{ x: 0.75, y: 0.5, authorName: 'Max', hue: 'pink' }
		]);
		const markers = [...root.querySelectorAll<HTMLElement>('a.marker')];
		expect(markers.map((m) => [m.textContent, m.dataset.hue])).toEqual([
			['AL', 'teal'],
			['M', 'pink']
		]);
		expect(markers[0].getAttribute('aria-label')).toBe('Comment 1 by Ada Lovelace');
	});

	it('puts the pin’s pointed corner on the point that was commented on', async () => {
		const root = renderPins([{ x: 0.25, y: 0.5, authorName: 'Ada Lovelace', hue: 'teal' }]);
		const img = root.querySelector('img')!;
		await expect.poll(() => img.complete && img.naturalWidth).toBe(400);
		const picture = img.getBoundingClientRect();
		const pin = root.querySelector('a.marker')!.getBoundingClientRect();
		const point = { x: picture.left + 0.25 * picture.width, y: picture.top + 0.5 * picture.height };
		expect(pin.width, 'pin width in px').toBe(24);
		expect(pin.left, 'pin’s left edge against the point').toBeCloseTo(point.x, 0);
		expect(pin.bottom, 'pin’s bottom edge against the point').toBeCloseTo(point.y, 0);
	});
});
