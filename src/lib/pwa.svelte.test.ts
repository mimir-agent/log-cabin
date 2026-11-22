import { describe, expect, it } from 'vitest';
import '../app.css';
import mark from './assets/mark.svg?raw';
import maskableMark from './assets/mark-maskable.svg?raw';
import { pageBackground } from './pwa.js';

// The manifest, the theme-color tags and the mark SVGs carry token colours as hex, because
// none of them can read CSS; this keeps them on what the tokens actually paint. Computed
// styles keep a colour's own notation (white is `oklch(1 0 0)`), so both sides are compared
// as painted pixels.
function pixel(colour: string): number[] {
	const context = document.createElement('canvas').getContext('2d')!;
	context.fillStyle = colour;
	context.fillRect(0, 0, 1, 1);
	return [...context.getImageData(0, 0, 1, 1).data];
}

function painted(token: string, scheme: 'light' | 'dark' = 'light'): string {
	const el = document.createElement('div');
	el.dataset.theme = scheme;
	el.style.backgroundColor = `var(${token})`;
	document.body.appendChild(el);
	const colour = getComputedStyle(el).backgroundColor;
	el.remove();
	return colour;
}

describe('page background for the installed app', () => {
	it.each(['light', 'dark'] as const)('matches --hue-z0-bg in the %s scheme', (scheme) => {
		expect(pixel(pageBackground[scheme])).toEqual(pixel(painted('--hue-z0-bg', scheme)));
	});
});

describe('the app mark', () => {
	// In the order the SVG paints them: the square, the flame, the flame's core.
	const tokens = ['--hue-gray-900', '--hue-orange-500', '--hue-amber-300'];

	it.each([
		['mark.svg', mark],
		['mark-maskable.svg', maskableMark]
	])('%s fills with the gray, orange and amber tokens', (file, svg) => {
		const fills = [...svg.matchAll(/fill="([^"]+)"/g)].map(([, fill]) => fill);
		expect(fills.map(pixel), `${file} fills ${fills.join(', ')}`).toEqual(
			tokens.map((token) => pixel(painted(token)))
		);
	});
});
