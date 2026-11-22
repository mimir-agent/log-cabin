import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { DocNode } from '#lib/editor/doc.js';
import RichText from '#lib/components/editor/RichText.svelte';

vi.mock('$app/state', () => ({ page: { data: { timeZone: 'UTC' } } }));

const updatedAt = Date.UTC(2026, 10, 2);

/** Answers each note's card as `cards` says: the card, or a 404 for a note not there. */
function cardsAre(cards: Record<string, object | null>) {
	const fetch = vi.fn(async (url: string) => {
		const id = /^\/notes\/([^/]+)\/card$/.exec(url)?.[1];
		if (!id || !(id in cards)) throw new Error(`unexpected fetch of ${url}`);
		const card = cards[id];
		return card ? Response.json(card) : Response.json({ message: 'Not found' }, { status: 404 });
	});
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

const link = (href: string, text: string): DocNode => ({
	type: 'paragraph',
	content: [
		{ type: 'text', text: 'See ' },
		{ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] }
	]
});

function body(content: DocNode[], props: Record<string, unknown> = {}) {
	return render(RichText, { doc: { type: 'doc', content }, customEmoji: {}, ...props });
}

const hikePlan = { title: 'Hike plan', authorName: 'Ada', updatedAt, thumbnailVersion: 4 };

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('the card on a link to a note', () => {
	it('shows the note’s title, author, update and thumbnail after resting on the link, and goes when the pointer leaves', async () => {
		const fetch = cardsAre({ N1: hikePlan });
		body([link('https://campfire.test/notes/N1', 'the plan')]);

		await userEvent.hover(page.getByRole('link', { name: 'the plan' }));
		const card = page.getByLabelText('Hike plan');
		await expect.element(card).toBeVisible();
		await expect.element(card).toHaveTextContent('Ada · updated');
		const updated = card.element().querySelector('time');
		expect(updated?.getAttribute('datetime'), 'the exact instant').toBe('2026-11-02T00:00:00.000Z');
		expect(updated?.title, 'the exact time on hover').toBe('Nov 2, 2026, 12:00 AM');
		expect(card.element().querySelector('img')?.getAttribute('src')).toBe(
			'/notes/N1/thumbnail?size=grid&v=4'
		);

		await userEvent.unhover(page.getByRole('link', { name: 'the plan' }));
		await expect.element(card).not.toBeInTheDocument();

		await userEvent.hover(page.getByRole('link', { name: 'the plan' }));
		await expect.element(card).toBeVisible();
		expect(fetch, 'asked for once on this page').toHaveBeenCalledTimes(1);
	});

	it('waits a moment before showing, so a pointer passing over the link shows nothing', async () => {
		cardsAre({ N2: { ...hikePlan, title: 'Packing list', thumbnailVersion: null } });
		body([link('/notes/N2', 'the list'), { type: 'paragraph', content: [] }]);

		await userEvent.hover(page.getByRole('link', { name: 'the list' }));
		await new Promise((settled) => setTimeout(settled, 100));
		expect(document.querySelectorAll('[data-popover-content]'), 'not yet').toHaveLength(0);
		const card = page.getByLabelText('Packing list');
		await expect.element(card).toBeVisible();
		expect(card.element().querySelector('img'), 'no thumbnail drawn yet').toBeNull();
	});

	it('shows on keyboard focus, and on a mention of a note, leaving focus on the link', async () => {
		cardsAre({ N3: { ...hikePlan, title: 'Route notes' } });
		body(
			[
				{
					type: 'paragraph',
					content: [{ type: 'resourceMention', attrs: { kind: 'note', id: 'N3' } }]
				}
			],
			{ resources: { 'note:N3': { title: 'Route notes', url: '/notes/N3' } } }
		);

		const chip = page.getByRole('link', { name: 'Route notes' });
		chip.element().focus();
		await expect.element(page.getByLabelText('Route notes')).toBeVisible();
		await expect.element(chip).toHaveFocus();
	});

	it('shows nothing at all for a note this reader can’t open, and leaves the link as it was', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const fetch = cardsAre({ N4: null });
		body([link('/notes/N4', 'a secret')]);

		await userEvent.hover(page.getByRole('link', { name: 'a secret' }));
		await expect.poll(() => fetch.mock.calls.length).toBe(1);
		await new Promise((settled) => setTimeout(settled, 100));
		expect(document.querySelectorAll('[data-popover-content]')).toHaveLength(0);
		expect(error, 'a note not there is no failure').not.toHaveBeenCalled();
		expect(page.getByRole('link', { name: 'a secret' }).element().getAttribute('href')).toBe(
			'/notes/N4'
		);
	});

	it('reports a failed ask, shows nothing, and asks again the next time the pointer rests', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const answers = [new Response('boom', { status: 500 }), Response.json(hikePlan)];
		const fetch = vi.fn(async () => answers.shift()!);
		vi.stubGlobal('fetch', fetch);
		body([link('/notes/N6', 'the plan')]);

		await userEvent.hover(page.getByRole('link', { name: 'the plan' }));
		await expect.poll(() => error.mock.calls.length).toBe(1);
		expect(error).toHaveBeenCalledWith(
			expect.objectContaining({ message: expect.stringContaining('answered 500') })
		);
		expect(document.querySelectorAll('[data-popover-content]')).toHaveLength(0);

		await userEvent.unhover(page.getByRole('link', { name: 'the plan' }));
		await userEvent.hover(page.getByRole('link', { name: 'the plan' }));
		await expect.element(page.getByLabelText('Hike plan')).toBeVisible();
		expect(fetch, 'the failure was not kept').toHaveBeenCalledTimes(2);
	});

	it('asks nothing for links that aren’t to a note, or on a page read signed out', async () => {
		const fetch = cardsAre({});
		body([link('/posts/P1', 'a post')]);
		body([link('/notes/N5', 'public note')], { noteCards: false });

		await userEvent.hover(page.getByRole('link', { name: 'a post' }));
		await userEvent.hover(page.getByRole('link', { name: 'public note' }));
		await new Promise((settled) => setTimeout(settled, 500));
		expect(fetch).not.toHaveBeenCalled();
		expect(document.querySelectorAll('[data-popover-content]')).toHaveLength(0);
	});
});
