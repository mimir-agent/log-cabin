/** Campsite's quick choices for pausing notifications, in menu order. */
export const pausePresets = ['thirtyMinutes', 'hour', 'twoHours', 'tomorrow', 'nextWeek'] as const;
export type PausePreset = (typeof pausePresets)[number];

const minuteMs = 60 * 1000;

/**
 * When a pause ends, in the browser's time zone: 9 AM tomorrow, or 9 AM next Monday, as in
 * Campsite. It runs in the browser when the reader picks a preset, so the zone is theirs.
 */
export function pauseEnd(preset: PausePreset, now: Date): number {
	const at = new Date(now);
	switch (preset) {
		case 'thirtyMinutes':
			return now.getTime() + 30 * minuteMs;
		case 'hour':
			return now.getTime() + 60 * minuteMs;
		case 'twoHours':
			return now.getTime() + 120 * minuteMs;
		case 'tomorrow':
			at.setDate(at.getDate() + 1);
			break;
		case 'nextWeek':
			// getDay() is 1 on a Monday; from a Monday, next Monday is 7 days on.
			at.setDate(at.getDate() + ((8 - at.getDay()) % 7 || 7));
			break;
	}
	at.setHours(9, 0, 0, 0);
	return at.getTime();
}
