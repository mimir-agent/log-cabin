// Adapted from Campsite (https://github.com/campsite/campsite), api/app/models/organization_membership_status.rb, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/
// Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/Home/UpdateStatusDialog.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/

// A status: an emoji, a line of text, and when it clears. Used by the server to save one and
// by the picker to offer the choices.

import { people, type StatusExpiry } from '../strings/people';
import { endOfDay, endOfWeek, parseZonedLocal } from './time';

export const statusExpiries = ['30m', '1h', '4h', 'today', 'this_week', 'custom', 'never'] as const;
export type { StatusExpiry };

export const statusTextMax = 80;
/** One emoji can be several code points (a flag, a family, a skin tone); this is generous. */
export const statusEmojiMax = 16;

export type Status = { emoji: string; text: string; expiresAt: number | null };

export function isStatusExpiry(value: unknown): value is StatusExpiry {
	return typeof value === 'string' && (statusExpiries as readonly string[]).includes(value);
}

/**
 * When a status set at `now` clears. "today" and "this week" end at midnight in the person's
 * own time zone; "custom" is a datetime-local value read in that zone; "never" is null.
 */
export function statusExpiresAt(
	expiry: StatusExpiry,
	now: number,
	timeZone: string,
	custom?: string
): number | null | 'invalid' {
	const minute = 60_000;
	switch (expiry) {
		case '30m':
			return now + 30 * minute;
		case '1h':
			return now + 60 * minute;
		case '4h':
			return now + 240 * minute;
		case 'today':
			return endOfDay(now, timeZone);
		case 'this_week':
			return endOfWeek(now, timeZone);
		case 'custom':
			return parseZonedLocal(custom ?? '', timeZone) ?? 'invalid';
		case 'never':
			return null;
	}
}

/** The status as it stands at `now`: null when there is none or it has run out. */
export function activeStatus(
	row: { statusEmoji: string | null; statusText: string | null; statusExpiresAt: number | null },
	now: number
): Status | null {
	if (row.statusText === null || row.statusEmoji === null) return null;
	// The */5 cron clears expired statuses; until it runs, one that has run out is hidden.
	if (row.statusExpiresAt !== null && row.statusExpiresAt <= now) return null;
	return { emoji: row.statusEmoji, text: row.statusText, expiresAt: row.statusExpiresAt };
}

/** One-click statuses for the picker. */
export const statusPresets: { emoji: string; text: string; expiry: StatusExpiry }[] = [
	{ emoji: '🥪', text: people.status.presets.lunch, expiry: '30m' },
	{ emoji: '🗓️', text: people.status.presets.meeting, expiry: '1h' },
	{ emoji: '🧠', text: people.status.presets.deepWork, expiry: '4h' },
	{ emoji: '😷', text: people.status.presets.sick, expiry: 'today' },
	{ emoji: '🌴', text: people.status.presets.vacation, expiry: 'this_week' }
];
