import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { ai } from '#lib/strings/ai.js';
import Summary from './Summary.svelte';

const summary = {
	bullets: [{ text: 'Morgan will price tents', cites: [2] }],
	sources: [
		{ id: 2, author: 'Morgan Member', kind: 'comment 1', text: 'Looks good, I will price tents.' }
	]
};

describe('Summary', () => {
	it('shows each bullet with its citations, and the disclaimer', async () => {
		render(Summary, { summary });

		await expect.element(page.getByText('Morgan will price tents')).toBeVisible();
		await expect.element(page.getByRole('link', { name: ai.summary.citation(2) })).toBeVisible();
		await expect.element(page.getByText(ai.summary.disclaimer)).toBeVisible();
	});

	it('highlights the quoted sentence when its citation is clicked', async () => {
		const { container } = render(Summary, { summary });
		const quote = container.querySelector('#summary-source-2')!;
		expect(quote.textContent).toContain('Looks good, I will price tents.');
		expect(quote.textContent).toContain('Morgan Member, comment 1');
		expect(quote.classList.contains('shown'), 'no source is highlighted before a click').toBe(
			false
		);

		await page.getByRole('link', { name: ai.summary.citation(2) }).click();

		expect(quote.classList.contains('shown'), 'the clicked source should be highlighted').toBe(
			true
		);
	});

	it('says so when no bullet survived the check', async () => {
		render(Summary, { summary: { bullets: [], sources: [] } });

		await expect.element(page.getByText(ai.summary.empty)).toBeVisible();
		await expect.element(page.getByText(ai.summary.disclaimer)).toBeVisible();
	});

	it('says the discussion is too short in place of the Summarize button', async () => {
		render(Summary, { tooShort: true });

		await expect.element(page.getByText(ai.summary.tooShort)).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: ai.summary.button }))
			.not.toBeInTheDocument();
	});

	it('links a cited comment to the comment on the page, and the body to its quote', () => {
		const { container } = render(Summary, {
			summary: {
				bullets: [{ text: 'Marketing can move its product emails', cites: [1, 2] }],
				sources: [
					{ id: 1, author: 'Priya', kind: 'post', text: 'Marketing plans emails around Fridays.' },
					{
						id: 2,
						author: 'Dana',
						kind: 'comment 1',
						text: 'We can move them.',
						anchor: 'comment-c1'
					}
				]
			}
		});

		const links = [...container.querySelectorAll('a.cite')].map((a) => a.getAttribute('href'));
		expect(links).toEqual(['#summary-source-1', '#comment-c1']);
	});
});
