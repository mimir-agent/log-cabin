import { describe, expect, it } from 'vitest';
import { time } from './strings/time';
import { canonicalZone, zoneOf, zoneToFollow } from './time-zone';

describe('a member’s saved time zone', () => {
	it('starts at UTC, which means they never told us, so it takes the browser’s', () => {
		expect(zoneToFollow('UTC', 'UTC', 'America/Los_Angeles')).toBe('America/Los_Angeles');
		expect(zoneToFollow('UTC', 'America/Los_Angeles', 'America/Los_Angeles')).toBe(
			'America/Los_Angeles'
		);
	});

	it('moves with the browser when it was the browser’s', () => {
		expect(zoneToFollow('America/Los_Angeles', 'America/Los_Angeles', 'America/New_York')).toBe(
			'America/New_York'
		);
	});

	it('stays where they put it by hand', () => {
		expect(zoneToFollow('Asia/Tokyo', 'America/Los_Angeles', 'America/Los_Angeles')).toBeNull();
		expect(zoneToFollow('Asia/Tokyo', 'America/Los_Angeles', 'America/New_York')).toBeNull();
	});

	it('is left alone when it already matches', () => {
		expect(zoneToFollow('America/Los_Angeles', 'UTC', 'America/Los_Angeles')).toBeNull();
	});

	it('takes a zone by either of its names', () => {
		expect(canonicalZone('Asia/Kolkata')).toBe(canonicalZone('Asia/Calcutta'));
		// Saved under V8's name from a Firefox that says Asia/Kolkata: nothing more to save.
		expect(zoneToFollow('Asia/Calcutta', 'Asia/Kolkata', 'Asia/Kolkata')).toBeNull();
		expect(zoneToFollow('Asia/Calcutta', 'Asia/Kolkata', 'Asia/Tokyo')).toBe('Asia/Tokyo');
	});
});

describe("the reader's time zone", () => {
	it('is the one their browser put in the cookie, else UTC', () => {
		expect(zoneOf('America/Los_Angeles')).toBe('America/Los_Angeles');
		expect(zoneOf(undefined)).toBe('UTC');
		expect(zoneOf('Mars/Olympus_Mons')).toBe('UTC');
	});

	it('gives the server the same time a Pacific browser shows, whatever zone the server is in', () => {
		const at = Date.UTC(2026, 10, 19, 3, 58);
		const browser = new Intl.DateTimeFormat('en', {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: 'America/Los_Angeles'
		}).format(at);

		expect(time.long(at, 'America/Los_Angeles')).toBe(browser);
		expect(browser).toBe('Nov 18, 2026, 7:58 PM');
	});
});
