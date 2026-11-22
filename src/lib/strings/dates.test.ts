// Every date and time is written in the reader's zone, whatever zone the server runs in. Run
// with the process at TZ=UTC, as the Worker is.
import { describe, expect, it } from 'vitest';
import { calendarDay } from '../time-zone';
import { calcom } from './calcom';
import { calls } from './calls';
import { chat } from './chat';
import { notes } from './notes';
import { posts } from './posts';
import { time } from './time';

const la = 'America/Los_Angeles';
const tokyo = 'Asia/Tokyo';
// Nov 18, 5:30 PM in Los Angeles; Nov 19, 1:30 AM in UTC; Nov 19, 10:30 AM in Tokyo.
const at = Date.UTC(2026, 10, 19, 1, 30);
// Intl puts a narrow no-break space before AM and PM.
const spaced = (text: string) => text.replace(/\u202f/g, ' ');
const inEach = (format: (zone: string) => string) =>
	Object.fromEntries(['UTC', la, tokyo].map((zone) => [zone, spaced(format(zone))]));

describe('calendarDay', () => {
	it('is the day in the zone, not in UTC', () => {
		expect(inEach((zone) => calendarDay(at, zone))).toEqual({
			UTC: '2026-11-19',
			[la]: '2026-11-18',
			[tokyo]: '2026-11-19'
		});
		expect(calendarDay(Date.UTC(2026, 10, 18, 16, 30), tokyo)).toBe('2026-11-19');
		expect(calendarDay(new Date(at), la)).toBe('2026-11-18');
	});
});

describe("a feed's day heading", () => {
	const day = (instant: number, zone: string, now: number) =>
		posts.feed.day(new Date(instant), zone, now);

	it('turns over at midnight in Los Angeles', () => {
		const now = Date.UTC(2026, 10, 19, 8, 30); // Nov 19, 12:30 AM there; 8:30 AM in UTC
		expect(day(Date.UTC(2026, 10, 19, 8, 1), la, now)).toBe('Today');
		expect(day(Date.UTC(2026, 10, 19, 7, 59), la, now)).toBe('Yesterday');
		expect(day(Date.UTC(2026, 10, 18, 7, 59), la, now)).toBe('Tuesday, Nov 17, 2026');
		expect(day(Date.UTC(2026, 10, 19, 7, 59), 'UTC', now)).toBe('Today');
	});

	it('turns over at midnight in Tokyo', () => {
		const now = Date.UTC(2026, 10, 18, 15, 30); // Nov 19, 12:30 AM there; 3:30 PM in UTC
		expect(day(Date.UTC(2026, 10, 18, 15, 1), tokyo, now)).toBe('Today');
		expect(day(Date.UTC(2026, 10, 18, 14, 59), tokyo, now)).toBe('Yesterday');
		expect(day(Date.UTC(2026, 10, 17, 14, 59), tokyo, now)).toBe('Tuesday, Nov 17, 2026');
		expect(day(Date.UTC(2026, 10, 18, 14, 59), 'UTC', now)).toBe('Today');
	});

	it('counts the 25-hour day the clocks go back as one day', () => {
		// Nov 1 runs from 12:00 AM PDT (07:00 UTC) to 11:59 PM PST (07:59 UTC on Nov 2).
		const lateOnTheFirst = Date.UTC(2026, 10, 2, 7, 30);
		const earlyOnTheFirst = Date.UTC(2026, 10, 1, 7, 30);
		expect(day(earlyOnTheFirst, la, lateOnTheFirst)).toBe('Today');
		expect(day(earlyOnTheFirst, la, Date.UTC(2026, 10, 2, 8, 30))).toBe('Yesterday');
		expect(day(Date.UTC(2026, 10, 1, 6, 59), la, Date.UTC(2026, 10, 2, 8, 30))).toBe(
			'Saturday, Oct 31, 2026'
		);
	});
});

describe('times', () => {
	it('short: the date a week on, with the year only when it is another year there', () => {
		const newYear = Date.UTC(2026, 0, 1, 3);
		const now = Date.UTC(2026, 10, 19);
		expect(inEach((zone) => time.short(newYear, zone, now))).toEqual({
			UTC: 'Jan 1',
			[la]: 'Dec 31, 2025',
			[tokyo]: 'Jan 1'
		});
		expect(time.short(now - 3_600_000, la, now)).toBe('1h');
	});

	it('long: the full date and time', () => {
		expect(inEach((zone) => time.long(at, zone))).toEqual({
			UTC: 'Nov 19, 2026, 1:30 AM',
			[la]: 'Nov 18, 2026, 5:30 PM',
			[tokyo]: 'Nov 19, 2026, 10:30 AM'
		});
	});

	it('divider: only the clock on the same day there', () => {
		const evening = Date.UTC(2026, 10, 19, 5); // Nov 18, 9:00 PM in Los Angeles
		expect(spaced(time.divider(at, la, evening))).toBe('5:30 PM');
		expect(spaced(time.divider(at, 'UTC', evening))).toBe('1:30 AM');
		const lateNight = Date.UTC(2026, 10, 18, 14, 30); // Nov 18, 11:30 PM in Tokyo
		const afterMidnight = Date.UTC(2026, 10, 18, 16); // Nov 19, 1:00 AM in Tokyo
		expect(spaced(time.divider(lateNight, tokyo, afterMidnight))).toBe('Nov 18 · 11:30 PM');
		expect(spaced(time.divider(lateNight, 'UTC', afterMidnight))).toBe('2:30 PM');
	});
});

describe('strings with a date or time in them', () => {
	it('a call in the calls list', () => {
		expect(inEach((zone) => calls.index.time(at, zone))).toEqual({
			UTC: '1:30 AM',
			[la]: '5:30 PM',
			[tokyo]: '10:30 AM'
		});
	});

	it('a chat message', () => {
		expect(inEach((zone) => chat.thread.when(at, zone))).toEqual({
			UTC: 'Nov 19, 2026, 1:30 AM',
			[la]: 'Nov 18, 2026, 5:30 PM',
			[tokyo]: 'Nov 19, 2026, 10:30 AM'
		});
	});

	it('when a note changed', () => {
		expect(inEach((zone) => notes.list.updated(at, zone))).toEqual({
			UTC: 'updated 11/19/2026',
			[la]: 'updated 11/18/2026',
			[tokyo]: 'updated 11/19/2026'
		});
	});

	it('a thread, its draft and its public link', () => {
		expect(inEach((zone) => posts.post.when(at, zone))).toEqual({
			UTC: 'Nov 19, 2026, 1:30 AM',
			[la]: 'Nov 18, 2026, 5:30 PM',
			[tokyo]: 'Nov 19, 2026, 10:30 AM'
		});
		expect(inEach((zone) => posts.drafts.saved(at, zone))).toEqual({
			UTC: 'Draft saved 1:30 AM',
			[la]: 'Draft saved 5:30 PM',
			[tokyo]: 'Draft saved 10:30 AM'
		});
		expect(inEach((zone) => posts.publicLink.footer(at, 'Log Cabin', zone))).toEqual({
			UTC: 'Started November 19, 2026 · Shared from Log Cabin',
			[la]: 'Started November 18, 2026 · Shared from Log Cabin',
			[tokyo]: 'Started November 19, 2026 · Shared from Log Cabin'
		});
	});

	it('a reminder', () => {
		expect(inEach((zone) => posts.followUps.setTime(at, zone))).toEqual({
			UTC: 'Thu, Nov 19, 1:30 AM',
			[la]: 'Wed, Nov 18, 5:30 PM',
			[tokyo]: 'Thu, Nov 19, 10:30 AM'
		});
		expect(inEach((zone) => posts.followUps.exactTime(at, zone))).toEqual({
			UTC: 'Thursday, November 19, 2026 at 1:30:00 AM UTC',
			[la]: 'Wednesday, November 18, 2026 at 5:30:00 PM PST',
			[tokyo]: 'Thursday, November 19, 2026 at 10:30:00 AM GMT+9'
		});
	});

	it('a pinned call with no title', () => {
		expect(inEach((zone) => posts.pins.untitledCall(at, zone))).toEqual({
			UTC: 'Call on Nov 19, 2026, 1:30 AM',
			[la]: 'Call on Nov 18, 2026, 5:30 PM',
			[tokyo]: 'Call on Nov 19, 2026, 10:30 AM'
		});
	});

	it('a booked call, for its guest', () => {
		const end = at + 30 * 60_000;
		expect(inEach((zone) => calcom.guest.when(at, end, zone))).toEqual({
			UTC: 'Booked for Nov 19, 2026, 1:30 AM to 2:00 AM UTC',
			[la]: 'Booked for Nov 18, 2026, 5:30 PM to 6:00 PM PST',
			[tokyo]: 'Booked for Nov 19, 2026, 10:30 AM to 11:00 AM GMT+9'
		});
	});
});
