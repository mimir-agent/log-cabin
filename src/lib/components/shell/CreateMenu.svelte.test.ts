import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { shell } from '#lib/strings/shell.js';
import CreateMenu from './CreateMenu.fixture.svelte';

const s = shell.create;

describe('the New menu', () => {
	it('asks what you are making: two rows, each with its muted line, the first lit', async () => {
		render(CreateMenu);
		await userEvent.click(page.getByRole('button', { name: 'New' }));

		const post = page.getByRole('menuitem', { name: new RegExp(`^${s.post.title}`) });
		const doc = page.getByRole('menuitem', { name: new RegExp(`^${s.doc.title}`) });
		await expect.element(post).toHaveTextContent(s.post.line);
		await expect.element(doc).toHaveTextContent(s.doc.line);
		await expect.element(post).toHaveAttribute('href', '/projects/p1/new');
		await expect.element(doc).toHaveAttribute('href', '/notes/new');
		await expect.element(post).toHaveAttribute('data-highlighted');
		await expect.element(doc).not.toHaveAttribute('data-highlighted');
	});

	it('answers the arrow keys and Escape as every menu does', async () => {
		render(CreateMenu);
		await userEvent.click(page.getByRole('button', { name: 'New' }));
		const post = page.getByRole('menuitem', { name: new RegExp(`^${s.post.title}`) });
		const doc = page.getByRole('menuitem', { name: new RegExp(`^${s.doc.title}`) });
		await expect.element(post).toHaveAttribute('data-highlighted');

		await userEvent.keyboard('{ArrowDown}');
		await expect.element(doc).toHaveAttribute('data-highlighted');
		await userEvent.keyboard('{Escape}');
		await expect.element(page.getByRole('menu')).not.toBeInTheDocument();
	});
});
