import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import Tooltip from './Tooltip.svelte';

const trigger = createRawSnippet<[{ props: Record<string, unknown> }]>(() => ({
	render: () => '<button type="button">Link</button>'
}));
const shortcut = { apple: '⌘K', other: 'Ctrl+K' };

afterEach(() => vi.restoreAllMocks());

describe('Tooltip', () => {
	it('shows its label alone when it has no shortcut', async () => {
		render(Tooltip, { props: { open: true, label: 'Bold', trigger } });
		const tip = page.getByRole('tooltip');
		await expect.element(tip).toHaveTextContent('Bold');
		expect(tip.element().querySelector('kbd')).toBeNull();
	});

	it('shows the shortcut written for this device after the label', async () => {
		for (const [userAgent, keys] of [
			['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', '⌘K'],
			['Mozilla/5.0 (X11; Linux x86_64)', 'Ctrl+K']
		]) {
			vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
			const { unmount } = render(Tooltip, {
				props: { open: true, label: 'Link', shortcut, trigger }
			});
			await expect.element(page.getByRole('tooltip').getByText(keys)).toBeVisible();
			unmount();
			vi.restoreAllMocks();
		}
	});
});
