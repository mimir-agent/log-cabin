import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import EmojiPicker from './EmojiPicker.svelte';

const orgEmoji = { custom: {}, orgName: 'Northwind', canAdd: false };

// The Unicode data arrives after the picker opens; this holds it back until the test lets go.
let arrive = () => {};
vi.mock('#lib/emoji/data.js', async () => {
	await new Promise<void>((resolve) => (arrive = resolve));
	return {
		unicodeSections: [
			{
				id: 'people-body',
				title: 'People & Body',
				items: [{ value: '👍', name: 'thumbs_up', skinTones: true, terms: 'thumbs up' }]
			}
		]
	};
});

describe('the emoji picker', () => {
	it('picks the first match for an Enter typed before the emoji have loaded', async () => {
		const onPick = vi.fn();
		render(EmojiPicker, { onPick, orgEmoji });
		await expect.element(page.getByRole('searchbox', { name: 'Search emoji' })).toHaveFocus();
		await userEvent.keyboard('thumbs{Enter}');
		expect(onPick).not.toHaveBeenCalled();
		arrive();
		await expect.poll(() => onPick.mock.calls).toEqual([['👍']]);
	});

	it('moves between its section tabs with the arrow keys', async () => {
		render(EmojiPicker, { onPick: vi.fn(), orgEmoji });
		arrive();
		await page.getByRole('button', { name: 'Frequently used' }).click();
		await userEvent.keyboard('{ArrowRight}');
		await expect.element(page.getByRole('button', { name: 'People & Body' })).toHaveFocus();
	});
});
