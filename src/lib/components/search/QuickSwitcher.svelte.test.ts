import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Editor from '../editor/Editor.svelte';
import QuickSwitcher from './QuickSwitcher.svelte';

vi.mock('$app/state', () => ({ page: { data: { timeZone: 'UTC' } } }));

describe('the Quick switcher’s Ctrl+K', () => {
	it('opens from the page, but not when an editor takes the key for its link field', async () => {
		render(QuickSwitcher, { projects: [], people: [], recent: [] });
		render(Editor, {
			name: 'body',
			placeholder: 'Write something',
			members: [],
			formatting: false
		});
		const switcher = page.getByRole('dialog', { name: 'Quick switcher' });

		await page.getByRole('textbox', { name: 'Write something' }).click();
		await userEvent.keyboard('{Control>}k{/Control}');
		await expect.element(page.getByRole('textbox', { name: 'Link address' })).toHaveFocus();
		await expect.element(switcher, { timeout: 200 }).not.toBeInTheDocument();

		await userEvent.keyboard('{Escape}');
		(document.activeElement as HTMLElement).blur();
		await userEvent.keyboard('{Control>}k{/Control}');
		await expect.element(switcher).toBeVisible();
	});
});
