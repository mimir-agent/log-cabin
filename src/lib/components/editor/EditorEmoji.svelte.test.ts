import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Editor from './Editor.svelte';

vi.mock('$app/state', () => ({
	page: { data: { timeZone: 'UTC', orgEmoji: { custom: {}, orgName: 'Northwind', canAdd: false } } }
}));

const props = {
	name: 'body',
	placeholder: 'Write something',
	members: [],
	slash: 'document' as const
};
const box = () => page.getByRole('textbox', { name: 'Write something' });
const text = () =>
	(
		document.querySelector('.ProseMirror') as HTMLElement & { editor: { getText(): string } }
	).editor.getText();

describe('Editor emoji', () => {
	// First in the file: the emoji names load once per page, and this is the first use of them.
	it('turns the first typed :tada: into 🎉', async () => {
		render(Editor, props);
		await box().click();
		await userEvent.keyboard('end :tada: ');
		await expect.poll(text).toBe('end 🎉 ');
	});

	describe('in a note on a phone', () => {
		beforeEach(() => page.viewport(390, 800));

		it('inserts a pick from the Add emoji button at the caret', async () => {
			render(Editor, { ...props, note: true });
			await box().click();
			await userEvent.keyboard('ab{ArrowLeft}');
			await page.getByRole('button', { name: 'Add emoji' }).click();
			await page.getByRole('searchbox', { name: 'Search emoji' }).fill('tada');
			await page.getByRole('button', { name: 'party_popper', exact: true }).click();
			await expect.poll(text).toBe('a🎉b');
			await expect.element(box()).toHaveFocus();
		});

		it('opens the picker from /emoji where it can be typed into, and inserts a pick at the caret', async () => {
			render(Editor, { ...props, note: true });
			await box().click();
			await userEvent.keyboard('b{ArrowLeft}/emoji{Enter}');
			await expect.element(page.getByRole('searchbox', { name: 'Search emoji' })).toBeVisible();
			await userEvent.keyboard('tada');
			await page.getByRole('button', { name: 'party_popper', exact: true }).click();
			await expect.poll(text).toBe('🎉b');
		});
	});
});
