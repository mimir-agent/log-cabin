import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { DocNode } from '#lib/editor/doc.js';
import Page from './+page.svelte';

const photo = (n: number): DocNode => ({
	type: 'image',
	attrs: { src: `/files/attachments/01JD5Z3W8Q9X2M4N6P7R8S9T0${n}`, alt: `photo ${n}` }
});

describe('the public post page', () => {
	it('serves every image of a gallery from the link, in its tiles and its lightbox', async () => {
		const data = {
			title: 'Camp',
			body: { type: 'doc', content: [1, 2, 3].map(photo) },
			authorName: 'Ana',
			createdAt: Date.UTC(2026, 10, 19),
			orgName: 'Campfire Test',
			indexable: false,
			logoUrl: null,
			filesUrl: '/p/tok/files/',
			url: 'https://campfire.test/p/tok',
			description: '',
			imageUrl: null
		};
		// Only what the page reads: the load's data, not the whole PageProps.
		render(Page, { data } as never);
		await page.getByRole('button', { name: 'Open photo 2' }).click();
		await expect.element(page.getByRole('dialog')).toBeVisible();

		const sources = [...document.querySelectorAll('img')].map((img) => img.getAttribute('src'));
		expect(sources).toEqual([
			'/p/tok/files/01JD5Z3W8Q9X2M4N6P7R8S9T01',
			'/p/tok/files/01JD5Z3W8Q9X2M4N6P7R8S9T02',
			'/p/tok/files/01JD5Z3W8Q9X2M4N6P7R8S9T03',
			'/p/tok/files/01JD5Z3W8Q9X2M4N6P7R8S9T02'
		]);
	});

	it('shows a mentioned post as unavailable, with no link and no title', async () => {
		const data = {
			title: 'Camp',
			body: {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [{ type: 'resourceMention', attrs: { kind: 'post' } }]
					}
				]
			},
			authorName: 'Ana',
			createdAt: Date.UTC(2026, 10, 19),
			orgName: 'Campfire Test',
			indexable: false,
			logoUrl: null,
			filesUrl: '/p/tok/files/',
			url: 'https://campfire.test/p/tok',
			description: '',
			imageUrl: null
		};
		render(Page, { data } as never);
		await expect.element(page.getByText('Thread unavailable')).toBeVisible();
		expect(page.getByRole('link', { name: 'Thread unavailable' }).elements()).toHaveLength(0);
	});
});
