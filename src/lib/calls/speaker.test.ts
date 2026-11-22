import { describe, expect, it } from 'vitest';
import { SpeakerTracker } from './speaker';

/** Feeds the tracker one reading per 100 ms for duration, and returns who it says is speaking. */
function speak(tracker: SpeakerTracker, levels: Record<string, number>, from: number, ms: number) {
	let speaker: string | null = null;
	for (let at = from; at < from + ms; at += 100) {
		speaker = tracker.update(new Map(Object.entries(levels)), at);
	}
	return speaker;
}

describe('the active speaker', () => {
	it('is whoever starts talking, and stays them after they stop', () => {
		const tracker = new SpeakerTracker();

		expect(speak(tracker, { ada: 0, bo: 0 }, 0, 500)).toBeNull();
		expect(speak(tracker, { ada: 0.2, bo: 0 }, 500, 400)).toBe('ada');
		expect(speak(tracker, { ada: 0, bo: 0 }, 900, 1000)).toBe('ada');
	});

	it('moves to someone else once they are clearly the one talking', () => {
		const tracker = new SpeakerTracker();
		speak(tracker, { ada: 0.2, bo: 0 }, 0, 400);

		expect(speak(tracker, { ada: 0, bo: 0.2 }, 400, 400)).toBe('bo');
	});

	it("doesn't flicker between two people talking about as loudly", () => {
		const tracker = new SpeakerTracker();
		speak(tracker, { ada: 0.2, bo: 0 }, 0, 400);
		const seen = new Set<string | null>();

		for (let at = 400; at < 3000; at += 100) {
			const wobble = at % 200 === 0 ? 0.03 : -0.03;
			seen.add(
				tracker.update(
					new Map([
						['ada', 0.2 - wobble],
						['bo', 0.2 + wobble]
					]),
					at
				)
			);
		}

		expect([...seen]).toEqual(['ada']);
	});

	it('ignores a single loud blip shorter than its window', () => {
		const tracker = new SpeakerTracker();
		speak(tracker, { ada: 0.1, bo: 0 }, 0, 400);

		expect(
			tracker.update(
				new Map([
					['ada', 0.1],
					['bo', 0.25]
				]),
				400
			)
		).toBe('ada');
	});

	it('forgets someone who left the call', () => {
		const tracker = new SpeakerTracker();
		speak(tracker, { ada: 0.2, bo: 0 }, 0, 400);

		expect(speak(tracker, { bo: 0.05 }, 400, 400)).toBe('bo');
	});
});
