import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { posts } from '#lib/strings/posts.js';
vi.mock('$app/forms', () => ({ enhance: () => ({}), deserialize: JSON.parse }));

import ResolveDialog from './ResolveDialog.svelte';

const s = posts.resolve;

/** The `?/draft` answer SvelteKit sends, with the AI stubbed; the mocked `deserialize` above reads plain JSON. */
const draftAnswer = (text: string) =>
	JSON.stringify({
		type: 'success',
		status: 200,
		data: {
			draft: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
		}
	});

const requested: string[] = [];

function stubServer(answer: string) {
	requested.length = 0;
	vi.stubGlobal('fetch', async (url: string | URL | Request) => {
		requested.push(String(url instanceof Request ? url.url : url));
		return new Response(answer, { headers: { 'content-type': 'application/json' } });
	});
}

afterEach(() => vi.unstubAllGlobals());

describe('the resolve dialog’s AI draft', () => {
	it('fills the editor with the draft, and asks the server for nothing else until Resolve is clicked', async () => {
		stubServer(draftAnswer('Shipped on Friday'));
		render(ResolveDialog, {
			props: { open: true, members: [], uploadUrl: '/files', canDraft: true }
		});

		await page.getByRole('button', { name: s.draft }).click();

		await expect
			.element(page.getByRole('textbox', { name: s.placeholder }))
			.toHaveTextContent('Shipped on Friday');
		const saved = document.querySelector<HTMLInputElement>('input[name="resolution"]')!;
		expect(saved.value).toContain('Shipped on Friday');
		expect(requested).toHaveLength(1);
		expect(requested[0]).toContain('?/draft');
	});

	it('offers no draft button where AI is off', async () => {
		stubServer(draftAnswer('Shipped on Friday'));
		render(ResolveDialog, {
			props: { open: true, members: [], uploadUrl: '/files', canDraft: false }
		});

		expect(page.getByRole('button', { name: s.draft }).elements()).toHaveLength(0);
	});

	it('says why when the server cannot draft', async () => {
		stubServer(
			JSON.stringify({
				type: 'failure',
				status: 502,
				data: { message: s.draftEmpty }
			})
		);
		render(ResolveDialog, {
			props: { open: true, members: [], uploadUrl: '/files', canDraft: true }
		});

		await page.getByRole('button', { name: s.draft }).click();

		await expect.element(page.getByRole('alert')).toHaveTextContent(s.draftEmpty);
	});
});
