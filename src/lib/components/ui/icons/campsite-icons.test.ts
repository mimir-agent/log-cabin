import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Icon from '../Icon.svelte';
import { icons, type IconData, type IconName } from './campsite-icons.js';

const entries = Object.entries(icons) as [string, IconData][];

describe('campsite icons', () => {
	it('has the converted icon set', () => {
		expect(entries.length).toBeGreaterThanOrEqual(250);
	});

	it('uses kebab-case names', () => {
		for (const [name] of entries) expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
	});

	it.each(entries)('%s is static SVG markup', (_name, icon) => {
		expect(icon.body.trim()).not.toBe('');
		expect(icon.body).not.toContain('={');
		expect(icon.body).not.toContain('strokeWidth');
		expect(icon.body).not.toContain('className');
		// JSX camelCase attributes; SVG's own camelCase attributes are allowed.
		expect(icon.body).not.toMatch(
			/\s(?!viewBox|maskUnits|gradientUnits|gradientTransform)[a-z]+[A-Z]\w*="/
		);
		expect(icon.body.replaceAll('{sw}', '')).not.toMatch(/[{}]/);
		expect(
			icon.viewBox
				.trim()
				.split(/[\s,]+/)
				.map(Number)
		).toSatisfy((n: number[]) => n.length === 4 && n.every(Number.isFinite));
		expect(icon.size).toBeGreaterThan(0);
	});

	it.each(entries)('%s renders through Icon.svelte', (name) => {
		const { body } = render(Icon, { props: { name: name as IconName, strokeWidth: '2' } });
		expect(body).toMatch(/<svg [^>]*aria-hidden="true"/);
		expect(body).not.toContain('{sw}');
		if (icons[name as IconName].body.includes('{sw}')) expect(body).toContain('stroke-width="2"');
		expect(body).toMatch(/<(path|circle|rect|g|ellipse|line|polyline|polygon)\b/);
	});

	it('labels an icon when asked', () => {
		const { body } = render(Icon, { props: { name: 'face-smile', label: 'Smile', size: 16 } });
		expect(body).toContain('role="img"');
		expect(body).toContain('aria-label="Smile"');
		expect(body).toContain('width="16"');
		expect(body).not.toContain('aria-hidden');
	});
});
