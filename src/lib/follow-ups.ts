/** The quick choices for a reminder, in menu order. */
export const followUpPresets = ['hour', 'threeHours', 'tomorrow', 'nextWeek'] as const;
export type FollowUpPreset = (typeof followUpPresets)[number];

const hourMs = 60 * 60 * 1000;

/**
 * When a preset reminder is due, in the browser's time zone: 9 AM for the day presets. It runs
 * in the browser when the reader picks a preset, so the browser's zone is the reader's.
 */
export function presetTime(preset: FollowUpPreset, now: Date): number {
	const at = new Date(now);
	switch (preset) {
		case 'hour':
			return now.getTime() + hourMs;
		case 'threeHours':
			return now.getTime() + 3 * hourMs;
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
