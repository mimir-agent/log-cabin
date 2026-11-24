import { describe, expect, it } from 'vitest';
import { calls } from './calls';

describe('calls.index.elapsed', () => {
	const { elapsed } = calls.index;

	it('says how long a live call has been going, in minutes', () => {
		expect(elapsed(0)).toBe('Just now');
		expect(elapsed(12)).toBe('12 min');
	});

	it('switches to hours from the hour on', () => {
		expect(elapsed(60)).toBe('1 h');
		expect(elapsed(75)).toBe('1 h 15 min');
	});
});

describe('calls.recording.sections', () => {
	it("are Campsite's names: Summary, Agenda and Next steps, in the order they are written", () => {
		expect(calls.recording.sections).toEqual({
			summary: 'Summary',
			topics: 'Agenda',
			nextSteps: 'Next steps'
		});
	});
});
