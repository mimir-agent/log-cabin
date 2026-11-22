import { people } from '../strings/people';
import { timeAgo } from './time';

const minute = 60_000;

/** The server writes last seen at most this often per person. */
export const seenThrottleMs = minute;

/** Seen this recently counts as "Active now": a few missed writes' worth. */
export const activeWindowMs = 5 * minute;

export function isActive(lastSeenAt: number | null, now: number): boolean {
	return lastSeenAt !== null && now - lastSeenAt < activeWindowMs;
}

/** "Active now", "Last seen 3 hours ago", or "Not seen yet". */
export function lastSeenText(lastSeenAt: number | null, now: number): string {
	if (lastSeenAt === null) return people.seen.never;
	if (isActive(lastSeenAt, now)) return people.seen.activeNow;
	return people.seen.lastSeen(timeAgo(lastSeenAt, now));
}
