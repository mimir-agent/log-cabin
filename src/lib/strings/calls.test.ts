import { describe, expect, it } from 'vitest';
import { calls } from './calls';

describe('calls.index.liveIn', () => {
	const { liveIn } = calls.index;

	it('names the place and the people in it', () => {
		expect(liveIn('Design', ['Ann', 'Bo'])).toBe('Design · Ann, Bo');
	});

	it('does not say a name twice when the place is that person', () => {
		expect(liveIn('Cy', ['Cy'])).toBe('Cy');
		expect(liveIn('Cy', ['Cy', 'Mo'])).toBe('Cy · Mo');
	});

	it('names the place alone when nobody is in it yet', () => {
		expect(liveIn('Your room', [])).toBe('Your room');
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
