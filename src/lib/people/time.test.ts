import { describe, expect, it } from 'vitest';
import { clockTime, hoursAhead, timeAgo } from './time';

// Wednesday 18 November 2026, 22:30 UTC.
const now = Date.UTC(2026, 10, 18, 22, 30);
const minute = 60_000;

describe('another member’s local time', () => {
	it.each([
		['Asia/Tokyo', '7:30', 17],
		['Asia/Kolkata', '4:00', 13.5],
		['America/Los_Angeles', '14:30', 0],
		['America/New_York', '17:30', 3]
	])('in %s reads %s, %s h from a reader in Los Angeles', (zone, clock, ahead) => {
		expect(clockTime(now, zone, 'en-GB')).toBe(clock);
		expect(hoursAhead(now, zone, 'America/Los_Angeles')).toBe(ahead);
	});

	it('follows daylight saving: London is 8 h ahead of Los Angeles in summer too', () => {
		const july = Date.UTC(2026, 6, 1, 12, 0);
		expect(clockTime(july, 'Europe/London', 'en-GB')).toBe('13:00');
		expect(hoursAhead(july, 'Europe/London', 'America/Los_Angeles')).toBe(8);
	});

	it.each([
		['Asia/Tokyo', -17],
		['America/New_York', -3],
		['UTC', -8]
	])('to a reader in %s, a Pacific member is %s h ahead', (yours, ahead) => {
		expect(clockTime(now, 'America/Los_Angeles', 'en-GB')).toBe('14:30');
		expect(hoursAhead(now, 'America/Los_Angeles', yours)).toBe(ahead);
	});
});

describe('last seen', () => {
	it.each([
		[30 * 1000, 'now'],
		[4 * minute, '4 minutes ago'],
		[3 * 60 * minute, '3 hours ago'],
		[26 * 60 * minute, 'yesterday'],
		[5 * 24 * 60 * minute, '5 days ago']
	])('%i ms ago reads "%s"', (elapsed, text) => {
		expect(timeAgo(now - elapsed, now)).toBe(text);
	});
});
