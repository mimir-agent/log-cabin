import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import Popover from './Popover.svelte';

describe('Popover', () => {
	it('opens against words in a text when it has no trigger', async () => {
		const words = document.body.appendChild(document.createElement('span'));
		words.textContent = 'the ridge';
		const children = createRawSnippet(() => ({ render: () => '<p>About the ridge</p>' }));
		render(Popover, { props: { open: true, anchor: words, label: 'Comment', children } });

		const content = page.getByLabelText('Comment');
		await expect.element(content).toBeVisible();
		await expect.element(content).toHaveTextContent('About the ridge');
		expect(page.getByRole('button').elements(), 'no trigger drawn').toHaveLength(0);
		words.remove();
	});
});

describe('Popover against words in a text', () => {
	it('leaves focus where it was, so someone writing there goes on writing', async () => {
		const field = document.body.appendChild(document.createElement('textarea'));
		field.focus();
		const children = createRawSnippet(() => ({ render: () => '<button>Reply</button>' }));
		render(Popover, { props: { open: true, anchor: field, label: 'Thread', children } });

		await expect.element(page.getByLabelText('Thread')).toBeVisible();
		await new Promise((settled) => setTimeout(settled, 100));
		expect(document.activeElement, 'still in the text').toBe(field);
		field.remove();
	});
});
