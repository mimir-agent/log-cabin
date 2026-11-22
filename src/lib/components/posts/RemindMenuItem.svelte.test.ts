import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import '../../../app.css';
import { posts } from '#lib/strings/posts.js';
import RemindMenuHarness from './RemindMenuHarness.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({}), deserialize: JSON.parse }));

const s = posts.followUps;

async function openReminders(props: { reminder?: { id: string }; oncustom?: () => void }) {
	render(RemindMenuHarness, { oncustom: () => {}, ...props });
	await page.getByRole('button', { name: 'More' }).click();
	// The keyboard, as the submenu opens over its own row when the pointer reaches it.
	await userEvent.keyboard('{ArrowDown}{ArrowRight}');
}

describe('the reminder row of a menu', () => {
	it('opens the presets and a time of your own beside it', async () => {
		await openReminders({});
		for (const preset of Object.values(s.presets)) {
			await expect.element(page.getByRole('menuitem', { name: preset })).toBeVisible();
		}
		await expect.element(page.getByRole('menuitem', { name: s.custom })).toBeVisible();
		await expect.element(page.getByRole('menuitem', { name: s.remove })).not.toBeInTheDocument();
	});

	it('asks for the time of your own', async () => {
		const oncustom = vi.fn();
		await openReminders({ oncustom });
		await page.getByRole('menuitem', { name: s.custom }).click();
		expect(oncustom).toHaveBeenCalledOnce();
	});

	it('offers to remove a reminder that is set', async () => {
		await openReminders({ reminder: { id: 'f1' } });
		await expect.element(page.getByRole('menuitem', { name: s.remove })).toBeVisible();
	});
});
