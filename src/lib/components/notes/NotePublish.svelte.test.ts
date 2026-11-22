import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import NotePublish from './NotePublish.svelte';

describe('NotePublish', () => {
	it('offers Publish while the note is private', async () => {
		render(NotePublish, { url: null, allowed: true });
		await expect.element(page.getByRole('button', { name: 'Publish' })).toBeVisible();
		expect(document.querySelector('input[name="on"]')?.getAttribute('value')).toBe('1');
	});

	it('shows the public link with Copy and Disable once published', async () => {
		render(NotePublish, { url: 'https://campfire.test/p/notes/tok', allowed: true });
		await expect
			.element(page.getByRole('textbox', { name: 'Public link to this doc' }))
			.toHaveValue('https://campfire.test/p/notes/tok');
		await expect.element(page.getByRole('button', { name: 'Copy' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Disable' })).toBeVisible();
		expect(document.querySelector('input[name="on"]')?.getAttribute('value')).toBe('0');
	});

	it('says public links are off instead of offering Publish', async () => {
		render(NotePublish, { url: null, allowed: false });
		await expect.element(page.getByText(/Public links are turned off/)).toBeVisible();
		expect(document.querySelector('button')).toBeNull();
	});
});
