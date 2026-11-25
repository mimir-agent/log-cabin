import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { people } from '#lib/strings/people.js';
import AccountMenu from './AccountMenu.svelte';

const s = people.status;
const props = { userName: 'Ada Lovelace', username: 'ada', items: [], variant: 'sidebar' as const };

describe('the account menu', () => {
	it('offers Set a status, and no Clear, when you have none', async () => {
		render(AccountMenu, { ...props, status: null });
		await userEvent.click(page.getByRole('button', { name: 'Ada Lovelace' }));

		await expect.element(page.getByRole('menuitem', { name: s.set })).toBeVisible();
		await expect.element(page.getByRole('menuitem', { name: s.clear })).not.toBeInTheDocument();
	});

	it('shows your status on the avatar and in the menu, with Change and Clear', async () => {
		render(AccountMenu, {
			...props,
			status: { emoji: '🥪', text: 'Lunch', expiresAt: null }
		});
		await expect.element(page.getByText('🥪').first()).toBeVisible();
		await userEvent.click(page.getByRole('button', { name: 'Ada Lovelace' }));

		await expect.element(page.getByText('Lunch')).toBeVisible();
		await expect.element(page.getByRole('menuitem', { name: s.edit })).toBeVisible();
		await expect.element(page.getByRole('menuitem', { name: s.clear })).toBeVisible();
	});

	it('opens the status picker from Set a status', async () => {
		render(AccountMenu, { ...props, status: null });
		await userEvent.click(page.getByRole('button', { name: 'Ada Lovelace' }));
		await userEvent.click(page.getByRole('menuitem', { name: s.set }));

		await expect.element(page.getByRole('dialog', { name: s.title })).toBeVisible();
		await expect.element(page.getByRole('button', { name: s.save })).toBeVisible();
	});

	it('opens Change status with your current status filled in', async () => {
		render(AccountMenu, {
			...props,
			status: { emoji: '🥪', text: 'Lunch', expiresAt: null }
		});
		await userEvent.click(page.getByRole('button', { name: 'Ada Lovelace' }));
		await userEvent.click(page.getByRole('menuitem', { name: s.edit }));

		await expect.element(page.getByRole('textbox', { name: s.text })).toHaveValue('Lunch');
	});
});
