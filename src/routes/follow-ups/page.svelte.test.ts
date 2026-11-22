import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('the Follow ups page', () => {
	it('shows when each reminder is due as a <time> with the exact time on hover', () => {
		const showAt = new Date('2026-11-24T17:00:00Z').getTime();
		const reminder = {
			id: 'f1',
			subjectType: 'post',
			title: 'Tent plan',
			url: '/posts/p1',
			showAt
		};
		// Only what the page reads: the load's data, not the whole PageProps.
		const root = render(Page, { data: { reminders: [reminder] } } as never).container;
		const time = root.querySelector('.item time');
		expect(time?.getAttribute('datetime')).toBe('2026-11-24T17:00:00.000Z');
		expect(time?.getAttribute('title')).toBe(
			new Date(showAt).toLocaleString('en', { dateStyle: 'full', timeStyle: 'long' })
		);
	});
});
