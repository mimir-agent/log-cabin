import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CallSummary from './CallSummary.svelte';

describe('CallSummary', () => {
	it("links each bullet's source to its line, with the time of the line it cites, and asks to play from it", async () => {
		const unit = {
			author: 'Ada',
			kind: 'comment',
			text: 'Ship it.',
			lineId: 'line-9',
			startMs: 65_000
		};
		const onseek = vi.fn();
		const screen = render(CallSummary, {
			onseek,
			summary: {
				sections: [
					{
						kind: 'summary',
						summary: {
							bullets: [{ text: 'Ada wants to ship.', cites: [1] }],
							sources: [{ ...unit, id: 1 }]
						}
					}
				]
			}
		});

		const cite = screen.getByRole('link', { name: 'Play recording from 1:05' });
		await expect.element(cite).toHaveTextContent('1:05');
		await expect.element(cite).toHaveAttribute('href', '#line-line-9');
		await cite.click();

		expect(onseek).toHaveBeenCalledWith('line-9');
	});
});
