import { describe, expect, test } from 'vitest';
import { keyboardInset } from './keyboard.js';

describe('keyboardInset', () => {
	test.each([
		['no keyboard', 664, { height: 664, offsetTop: 0 }, 0],
		[
			'iOS keyboard up: the visual viewport shrinks, the layout one does not',
			664,
			{ height: 328, offsetTop: 0 },
			336
		],
		['page panned down inside the shrunk viewport', 664, { height: 328, offsetTop: 120 }, 216],
		[
			'pinch zoom out leaves a visual viewport taller than the layout one',
			664,
			{ height: 700, offsetTop: 0 },
			0
		],
		['fractional heights round', 664, { height: 328.4, offsetTop: 0 }, 336]
	])('%s', (_name, innerHeight, visual, expected) => {
		expect(keyboardInset(innerHeight, visual)).toBe(expected);
	});
});
