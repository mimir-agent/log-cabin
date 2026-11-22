import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { DocNode } from '#lib/editor/doc.js';
import type { LinkPreview } from '#lib/link-preview.js';
import RichText from './RichText.svelte';

const linked = (text: string, href: string): DocNode => ({
	type: 'text',
	text,
	marks: [{ type: 'link', attrs: { href } }]
});
const paragraph = (...content: DocNode[]): DocNode => ({ type: 'paragraph', content });

/** Renders a document while /link-preview answers with this preview. */
function renderWithPreview(preview: LinkPreview | null | 'fails', ...content: DocNode[]) {
	const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
		preview === 'fails' ? new Response('', { status: 500 }) : Response.json({ preview })
	);
	vi.stubGlobal('fetch', fetch);
	const root = render(RichText, { doc: { type: 'doc', content }, customEmoji: {} }).container;
	return { root, fetch };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('a link on a line of its own', () => {
	it('shows a card with the page’s title, description and domain', async () => {
		const { root, fetch } = renderWithPreview(
			{
				kind: 'page',
				url: 'https://camp.example/tents',
				title: 'Tents & tarps',
				description: 'Everything for a dry night.',
				image: null,
				domain: 'camp.example'
			},
			paragraph(linked('https://camp.example/tents', 'https://camp.example/tents'))
		);
		await expect.poll(() => root.querySelector('a.card')?.textContent).toContain('Tents & tarps');
		expect(root.querySelector('a.card .title + .description + .domain')?.textContent).toBe(
			'camp.example'
		);
		expect(root.querySelector('a.card')!.getAttribute('href')).toBe('https://camp.example/tents');
		expect(String(fetch.mock.calls[0])).toContain(
			`/link-preview?url=${encodeURIComponent('https://camp.example/tents')}`
		);
	});

	it('shows a YouTube video as a thumbnail and loads nothing from YouTube until played', async () => {
		const { root } = renderWithPreview(
			{
				kind: 'youtube',
				url: 'https://youtu.be/dQw4w9WgXcQ',
				videoId: 'dQw4w9WgXcQ',
				title: 'Pitching a tent'
			},
			paragraph(linked('https://youtu.be/dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ'))
		);
		await expect.poll(() => root.querySelector('.video button')).toBeTruthy();
		expect(root.querySelector('iframe')).toBeNull();
		expect(root.querySelector('.video img')!.getAttribute('src')).toBe(
			'/link-preview/youtube/dQw4w9WgXcQ'
		);
		const play = root.querySelector<HTMLButtonElement>('.video button')!;
		expect(play.getAttribute('aria-label')).toBe('Play Pitching a tent');

		play.click();
		await expect.poll(() => root.querySelector('iframe')).toBeTruthy();
		const frame = root.querySelector('iframe')!;
		expect(frame.getAttribute('src')).toBe(
			'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1'
		);
		expect(frame.getAttribute('title')).toBe('Pitching a tent');
		expect(root.querySelector('.video img')).toBeNull();
	});

	it('crops a 4:3 YouTube thumbnail to the 16:9 box instead of running past it', async () => {
		const { root } = renderWithPreview(
			{ kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', videoId: 'dQw4w9WgXcQ', title: null },
			paragraph(linked('https://youtu.be/dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ'))
		);
		await expect.poll(() => root.querySelector('.video img')).toBeTruthy();
		// YouTube's hqdefault thumbnails are 480×360.
		const img = root.querySelector<HTMLImageElement>('.video img')!;
		img.src = `data:image/svg+xml,${encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>'
		)}`;
		await expect.poll(() => img.complete && img.naturalWidth).toBe(480);
		const box = root.querySelector('.video')!.getBoundingClientRect();
		const picture = img.getBoundingClientRect();
		expect(box.width / box.height, 'the box’s aspect ratio').toBeCloseTo(16 / 9, 2);
		expect(picture.height, 'thumbnail height against the box’s').toBeCloseTo(box.height, 0);
	});

	it('stays a plain link when there is no preview', async () => {
		const { root, fetch } = renderWithPreview(
			'fails',
			paragraph(linked('https://down.example', 'https://down.example'))
		);
		await expect.poll(() => fetch.mock.calls.length).toBe(1);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(root.querySelector('a.card, iframe')).toBeNull();
		expect(root.querySelector('p a')!.getAttribute('href')).toBe('https://down.example');
	});

	it('previews the first three links on lines of their own and leaves the rest as links', async () => {
		const links = ['a', 'b', 'c', 'd'].map((name) => `https://${name}.example/`);
		const { root, fetch } = renderWithPreview(
			null,
			...links.map((href) => paragraph(linked(href, href)))
		);
		await expect.poll(() => fetch.mock.calls.length).toBe(3);
		expect(fetch.mock.calls.map(([url]) => url)).toEqual(
			links.slice(0, 3).map((href) => `/link-preview?url=${encodeURIComponent(href)}`)
		);
		expect(root.querySelectorAll('p a')).toHaveLength(4);
	});

	it('asks for no preview of a link inside a sentence or with its own words', () => {
		const { fetch } = renderWithPreview(
			null,
			paragraph({ type: 'text', text: 'See ' }, linked('https://a.example', 'https://a.example')),
			paragraph(linked('the docs', 'https://b.example'))
		);
		expect(fetch).not.toHaveBeenCalled();
	});
});
