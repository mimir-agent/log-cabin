import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RemindMe from './RemindMe.svelte';

describe('the reminder button', () => {
	it('shows a set reminder’s time as a <time> with the exact time on hover', () => {
		const showAt = new Date('2026-11-24T17:00:00Z').getTime();
		const root = render(RemindMe, {
			action: '/follow-ups?/set',
			fields: { subjectType: 'post', subjectId: 'p1' },
			reminder: { id: 'f1', showAt }
		}).container;
		const time = root.querySelector('button time');
		expect(time?.getAttribute('datetime')).toBe('2026-11-24T17:00:00.000Z');
		expect(time?.getAttribute('title')).toBe(
			new Date(showAt).toLocaleString('en', { dateStyle: 'full', timeStyle: 'long' })
		);
	});
});
