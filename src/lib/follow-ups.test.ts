import { describe, expect, it } from 'vitest';
import { presetTime } from './follow-ups';

describe('reminder presets', () => {
	// A Wednesday afternoon, in the test process's own time zone, as the browser would see it.
	const wednesday = new Date(2026, 10, 18, 15, 20);

	it('counts hours from now', () => {
		expect(presetTime('hour', wednesday)).toBe(wednesday.getTime() + 60 * 60 * 1000);
		expect(presetTime('threeHours', wednesday)).toBe(wednesday.getTime() + 3 * 60 * 60 * 1000);
	});

	it('means 9 AM for tomorrow', () => {
		expect(new Date(presetTime('tomorrow', wednesday))).toEqual(new Date(2026, 10, 19, 9, 0));
	});

	it('means 9 AM on the coming Monday for next week, even from a Monday', () => {
		expect(new Date(presetTime('nextWeek', wednesday))).toEqual(new Date(2026, 10, 23, 9, 0));
		const monday = new Date(2026, 10, 23, 8, 0);
		expect(new Date(presetTime('nextWeek', monday))).toEqual(new Date(2026, 10, 30, 9, 0));
	});
});
