import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { DocNode } from '#lib/editor/doc.js';
import MessageFiles from './MessageFiles.svelte';

const file = (id: string, name: string, contentType: string): DocNode => ({
	type: 'attachment',
	attrs: { id, name, size: 2048, contentType }
});

const show = (...nodes: DocNode[]) =>
	render(MessageFiles, { nodes, customEmoji: {}, origin: 'https://camp.example' }).container;

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('a message’s design-tool file', () => {
	it.each([
		['demo.origami', 'origami-public'],
		['demo.prd', 'principle'],
		['demo.stitch', 'stitch']
	])('%s links to its app, downloads, and has a QR code', async (name, scheme) => {
		const root = show(file('f1', name, 'application/octet-stream'));

		const open = root.querySelector<HTMLAnchorElement>('a[title="Open in app"]')!;
		expect(open.href).toBe(`${scheme}://camp.example/files/attachments/f1`);
		expect(root.querySelector('a[title="Download"]')?.getAttribute('href')).toBe(
			'/files/attachments/f1'
		);
		expect(root.querySelector('button[title="Show QR code"]')).not.toBeNull();
	});
});

describe('a message’s JSON file', () => {
	it('plays an animation in place of its card', async () => {
		vi.stubGlobal('fetch', async () =>
			Response.json({ v: '5.7.0', fr: 30, ip: 0, op: 30, w: 10, h: 10, layers: [] })
		);
		const root = show(file('f2', 'spin.json', 'application/json'));

		await expect.poll(() => root.querySelector('[role="img"] svg')).not.toBeNull();
		expect(root.querySelector('a.card')).toBeNull();
	});

	it('shows a JSON file that is no animation as a file card', async () => {
		vi.stubGlobal('fetch', async () => Response.json({ name: 'settings' }));
		const root = show(file('f3', 'settings.json', 'application/json'));

		await expect.poll(() => root.querySelector('a.card')?.textContent).toContain('settings.json');
	});
});
