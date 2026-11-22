import { render } from 'svelte/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LocalTime from './LocalTime.svelte';

// Workers run in UTC, so this server does too, whatever zone the machine running the tests is in.
process.env.TZ = 'UTC';

// Thursday 19 November 2026, 23:30 UTC: 3:30 PM in Los Angeles.
const now = Date.UTC(2026, 10, 19, 23, 30);

describe('a member’s local time, written by the server', () => {
	beforeEach(() => vi.useFakeTimers({ now }));
	afterEach(() => vi.useRealTimers());

	it('is the time in the member’s zone, not the server’s', () => {
		expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC');
		const { body } = render(LocalTime, {
			props: { timezone: 'America/Los_Angeles', lastSeenAt: null }
		});
		expect(body).toContain('3:30 PM local time');
		expect(body).not.toContain('11:30 PM');
	});
});
