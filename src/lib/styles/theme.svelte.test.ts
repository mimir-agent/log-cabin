import { afterEach, describe, expect, it } from 'vitest';
import '../../app.css';
import {
	applyTheme,
	parseThemeChoice,
	resolveScheme,
	themeAttribute,
	themeHtmlAttribute
} from './theme.js';

const root = document.documentElement;

function probe(): HTMLElement {
	const el = document.createElement('div');
	el.style.backgroundColor = 'var(--hue-z0-bg)';
	el.style.color = 'var(--hue-z0-fg)';
	document.body.appendChild(el);
	return el;
}

afterEach(() => root.removeAttribute(themeAttribute));

describe('theme choice', () => {
	it('reads anything unknown as system', () => {
		expect(parseThemeChoice('dark')).toBe('dark');
		expect(parseThemeChoice('sepia')).toBe('system');
		expect(parseThemeChoice(null)).toBe('system');
	});

	it('writes the attribute only for a forced scheme', () => {
		expect(themeHtmlAttribute('dark')).toBe(' data-theme="dark"');
		expect(themeHtmlAttribute('light')).toBe(' data-theme="light"');
		expect(themeHtmlAttribute('system')).toBe('');
	});

	it('resolves system from the preference', () => {
		expect(resolveScheme('system', true)).toBe('dark');
		expect(resolveScheme('system', false)).toBe('light');
		expect(resolveScheme('light', true)).toBe('light');
	});
});

describe('applyTheme', () => {
	it('flips every surface token with the one attribute', () => {
		const el = probe();
		applyTheme('light');
		const light = getComputedStyle(el).backgroundColor;
		const lightText = getComputedStyle(el).color;
		applyTheme('dark');
		expect(root.getAttribute(themeAttribute)).toBe('dark');
		expect(getComputedStyle(root).colorScheme).toBe('dark');
		expect(getComputedStyle(el).backgroundColor).not.toBe(light);
		expect(getComputedStyle(el).color).not.toBe(lightText);
		el.remove();
	});

	it('removes the attribute for system', () => {
		applyTheme('dark');
		applyTheme('system');
		expect(root.hasAttribute(themeAttribute)).toBe(false);
	});

	it('lets a subtree force its own scheme', () => {
		applyTheme('light');
		const stage = document.createElement('section');
		stage.setAttribute(themeAttribute, 'dark');
		document.body.appendChild(stage);
		const inside = probe();
		stage.appendChild(inside);
		const outside = probe();
		expect(getComputedStyle(inside).backgroundColor).not.toBe(
			getComputedStyle(outside).backgroundColor
		);
		stage.remove();
		outside.remove();
	});
});
