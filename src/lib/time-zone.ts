// The reader's time zone, so the server writes dates and times as their browser would. The
// browser keeps it in a cookie; until it has, the server writes UTC.

export const zoneCookie = 'tz';

/** The zone a cookie names, or UTC when it names none this runtime knows. */
export function zoneOf(cookie: string | undefined): string {
	if (!cookie) return 'UTC';
	try {
		new Intl.DateTimeFormat('en', { timeZone: cookie });
		return cookie;
	} catch {
		return 'UTC';
	}
}

/** The day an instant falls on in a zone, as YYYY-MM-DD: what lists group by. */
export function calendarDay(at: number | Date, timeZone: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(at);
}

/**
 * This runtime's name for a zone. Runtimes name some zones differently: Firefox says
 * Asia/Kolkata where V8 says Asia/Calcutta, and both take either.
 */
export function canonicalZone(zone: string): string {
	return new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone;
}

/**
 * The zone to save for a member whose browser moved from `previous` to `browser`, or null to
 * keep `saved`. A member follows their browser until they pick another zone in settings. UTC,
 * the default, means they never told us, so a browser elsewhere replaces it.
 */
export function zoneToFollow(saved: string, previous: string, browser: string): string | null {
	const [s, p, b] = [saved, previous, browser].map(canonicalZone);
	if (s === b) return null;
	return s === 'UTC' || s === p ? browser : null;
}
