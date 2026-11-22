// Times in another person's time zone, with no library: Intl does the zone arithmetic.

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

function wallClock(instant: number, timeZone: string): WallClock & { weekday: number } {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		weekday: 'short',
		hourCycle: 'h23'
	}).formatToParts(instant);
	const get = (type: string) => parts.find((p) => p.type === type)!.value;
	const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	return {
		year: Number(get('year')),
		month: Number(get('month')),
		day: Number(get('day')),
		hour: Number(get('hour')),
		minute: Number(get('minute')),
		weekday: weekdays.indexOf(get('weekday'))
	};
}

/** How far the zone is ahead of UTC at this instant, in ms (negative behind). */
export function zoneOffset(instant: number, timeZone: string): number {
	const w = wallClock(instant, timeZone);
	const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
	return asUtc - Math.floor(instant / minute) * minute;
}

/** The instant a wall-clock time happens in the zone. Month is 1–12; days past the month roll over. */
export function zonedInstant(w: WallClock, timeZone: string): number {
	const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
	// Correct twice: the offset at the guess can differ from the offset at the answer across a
	// daylight-saving change.
	const first = guess - zoneOffset(guess, timeZone);
	return guess - zoneOffset(first, timeZone);
}

/** The next midnight in the zone after `now`: the end of their today. */
export function endOfDay(now: number, timeZone: string): number {
	const w = wallClock(now, timeZone);
	return zonedInstant(
		{ year: w.year, month: w.month, day: w.day + 1, hour: 0, minute: 0 },
		timeZone
	);
}

/** Midnight at the end of their Sunday: weeks run Monday to Sunday. */
export function endOfWeek(now: number, timeZone: string): number {
	const w = wallClock(now, timeZone);
	const daysLeft = (7 - w.weekday) % 7;
	return zonedInstant(
		{ year: w.year, month: w.month, day: w.day + daysLeft + 1, hour: 0, minute: 0 },
		timeZone
	);
}

/** "datetime-local" input text read as a time in the zone, or null when it isn't one. */
export function parseZonedLocal(value: string, timeZone: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
	if (!m) return null;
	const [year, month, dayOfMonth, h, min] = m.slice(1).map(Number);
	return zonedInstant({ year, month, day: dayOfMonth, hour: h, minute: min }, timeZone);
}

/** The clock time in the zone, as the reader's locale writes it ("14:32", "2:32 PM"). */
export function clockTime(instant: number, timeZone: string, locale?: string): string {
	return new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit' }).format(
		instant
	);
}

/** How many hours their zone is ahead of yours right now; negative when behind. */
export function hoursAhead(now: number, theirs: string, yours: string): number {
	return (zoneOffset(now, theirs) - zoneOffset(now, yours)) / hour;
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "just now", "4 minutes ago", "3 hours ago", "yesterday", "5 days ago", "2 months ago". */
export function timeAgo(then: number, now: number): string {
	const elapsed = Math.max(0, now - then);
	if (elapsed < minute) return relative.format(0, 'second');
	if (elapsed < hour) return relative.format(-Math.floor(elapsed / minute), 'minute');
	if (elapsed < day) return relative.format(-Math.floor(elapsed / hour), 'hour');
	if (elapsed < 30 * day) return relative.format(-Math.floor(elapsed / day), 'day');
	return relative.format(-Math.floor(elapsed / (30 * day)), 'month');
}
