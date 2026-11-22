import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('the public note page', () => {
	it('shows the title, byline and body, with the title and description as OG tags', async () => {
		const data = {
			title: 'Hike plan',
			body: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Meet at nine.' }] }]
			},
			authorName: 'Ada',
			updatedAt: Date.UTC(2026, 10, 19, 12),
			orgName: 'Northwind',
			indexable: false,
			url: 'https://campfire.test/p/notes/tok',
			description: 'Meet at nine.',
			timeZone: 'UTC'
		};
		// Only what the page reads: the load's data and the root layout's time zone.
		render(Page, { data } as never);
		await expect.element(page.getByRole('heading', { name: 'Hike plan' })).toBeVisible();
		await expect.element(page.getByText('Meet at nine.')).toBeVisible();
		await expect.element(page.getByText('Updated November 19, 2026')).toBeVisible();
		const meta = (property: string) =>
			document.head.querySelector(`meta[property="${property}"]`)?.getAttribute('content');
		expect(meta('og:title')).toBe('Hike plan');
		expect(meta('og:description')).toBe('Meet at nine.');
		expect(meta('og:type')).toBe('article');
		expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
			'noindex'
		);
	});
});

describe('a link to a note on the public note page', () => {
	it('shows no note card and asks for none, since its reader is signed out', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		const link = { type: 'link', attrs: { href: '/notes/N1' } };
		const data = {
			title: 'Hike plan',
			body: {
				type: 'doc',
				content: [
					{ type: 'paragraph', content: [{ type: 'text', text: 'the route', marks: [link] }] }
				]
			},
			authorName: 'Ada',
			updatedAt: 0,
			orgName: 'Northwind',
			indexable: false,
			url: 'https://campfire.test/p/notes/tok',
			description: '',
			timeZone: 'UTC'
		};
		render(Page, { data } as never);
		await userEvent.hover(page.getByRole('link', { name: 'the route' }));
		await new Promise((settled) => setTimeout(settled, 500));
		expect(fetch).not.toHaveBeenCalled();
		expect(document.querySelectorAll('[data-popover-content]')).toHaveLength(0);
		vi.unstubAllGlobals();
	});
});

describe('a mention of a note, post or call on the public note page', () => {
	it('shows as unavailable, its id having been left out of the body', async () => {
		const data = {
			title: 'Hike plan',
			body: {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{ type: 'text', text: 'See ' },
							{ type: 'resourceMention', attrs: { kind: 'note' } }
						]
					}
				]
			},
			authorName: 'Ada',
			updatedAt: 0,
			orgName: 'Northwind',
			indexable: false,
			url: 'https://campfire.test/p/notes/tok',
			description: '',
			timeZone: 'UTC'
		};
		render(Page, { data } as never);
		await expect.element(page.getByText('Doc unavailable')).toBeVisible();
		expect(
			page.getByRole('link', { name: 'Doc unavailable' }).elements(),
			'not a link'
		).toHaveLength(0);
	});
});
