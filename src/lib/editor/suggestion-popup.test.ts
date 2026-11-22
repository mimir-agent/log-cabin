import { describe, expect, test } from 'vitest';
import { placePopup } from './suggestion-popup.js';

const screen = { left: 0, top: 0, width: 1000, height: 800 };
const popup = { width: 200, height: 150 };
const gap = 4;

describe('placePopup', () => {
	test('opens below the caret when it fits', () => {
		const caret = { left: 100, top: 200, bottom: 220 };
		expect(placePopup(caret, popup, screen, gap)).toEqual({ left: 100, top: 224 });
	});

	test('opens above the caret when the bottom edge would pass the screen', () => {
		const caret = { left: 100, top: 760, bottom: 780 };
		expect(placePopup(caret, popup, screen, gap)).toEqual({ left: 100, top: 606 });
	});

	test('opens below when it fits exactly', () => {
		const caret = { left: 100, top: 600, bottom: 646 };
		expect(placePopup(caret, popup, screen, gap)).toEqual({ left: 100, top: 650 });
	});

	test('is pulled back from the right edge', () => {
		const caret = { left: 950, top: 200, bottom: 220 };
		expect(placePopup(caret, popup, screen, gap).left).toBe(800);
	});

	test('is pulled in from the left edge of a zoomed-in screen', () => {
		const zoomed = { left: 300, top: 0, width: 400, height: 800 };
		const caret = { left: 100, top: 200, bottom: 220 };
		expect(placePopup(caret, popup, zoomed, gap).left).toBe(300);
	});

	test('follows a visual viewport the keyboard has shortened', () => {
		const withKeyboard = { ...screen, height: 400 };
		const caret = { left: 100, top: 300, bottom: 320 };
		expect(placePopup(caret, popup, screen, gap).top, 'room below on a full screen').toBe(324);
		expect(placePopup(caret, popup, withKeyboard, gap).top, 'none above the keyboard').toBe(146);
	});

	test('stays at the top of the screen when it fits neither above nor below', () => {
		const short = { ...screen, top: 50, height: 120 };
		const caret = { left: 100, top: 100, bottom: 120 };
		expect(placePopup(caret, popup, short, gap).top).toBe(50);
	});
});
