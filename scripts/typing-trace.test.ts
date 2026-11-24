import { describe, expect, it } from 'vitest';
import { keyWork, selfTimes, summarise, type TraceEvent } from './typing-trace.ts';

const x = (name: string, ts: number, dur: number, type?: string, tid = 1): TraceEvent => ({
	ph: 'X',
	name,
	ts,
	dur,
	pid: 1,
	tid,
	args: type ? { data: { type } } : undefined
});

describe('keyWork', () => {
	// Two keys, 100 ms apart. The first key's task holds its keydown, an input handler and a
	// later frame task with a style pass and a layout; a compositor event on another thread and
	// the frame's paint come after.
	const events = [
		x('RunTask', 1_000, 4_000),
		x('EventDispatch', 1_000, 1_500, 'keydown'),
		x('EventDispatch', 2_500, 1_000, 'input'),
		x('RunTask', 10_000, 6_000),
		x('UpdateLayoutTree', 10_000, 2_000),
		x('Layout', 12_000, 3_000),
		x('Paint', 16_500, 1_000),
		x('Layout', 5_000, 9_000, undefined, 2),
		x('RunTask', 101_000, 2_000),
		x('EventDispatch', 101_000, 1_000, 'keydown')
	];

	it('sums the busy time from the keydown to the end of the layout, idle gaps left out', () => {
		const [first] = keyWork(events);
		// RunTask 1_000–5_000 (4 ms) plus the frame task 10_000–15_000 up to the layout's end.
		expect(first.ms).toBe(9);
		expect(first.laidOut).toBe(true);
	});

	it('runs on to the end of the key handlers when a layout is forced inside the keypress', () => {
		// The keypress forces a layout at 3–4 ms and its input handler keeps running to 8 ms.
		const forced = [
			x('RunTask', 0, 10_000),
			x('EventDispatch', 0, 1_000, 'keydown'),
			x('EventDispatch', 1_000, 7_000, 'keypress'),
			x('Layout', 3_000, 1_000),
			x('EventDispatch', 4_000, 4_000, 'input'),
			x('Paint', 9_000, 1_000),
			x('EventDispatch', 100_000, 1_000, 'keydown')
		];
		const [key] = keyWork(forced);
		expect(key.end).toBe(8_000);
		expect(key.ms).toBe(8);
	});

	it('ends a key without a layout at its own dispatch and says so', () => {
		const second = keyWork(events)[1];
		expect(second.laidOut).toBe(false);
		expect(second.ms).toBe(1);
	});

	it('refuses keydowns found on two threads', () => {
		expect(() =>
			keyWork([x('EventDispatch', 0, 1, 'keydown'), x('EventDispatch', 9, 1, 'keydown', 2)])
		).toThrow('Expected the keydowns on one main thread, found them on 2');
	});
});

describe('selfTimes', () => {
	it('gives a parent only the time its children did not take, per key', () => {
		const events = [
			x('RunTask', 0, 10_000),
			x('EventDispatch', 0, 6_000, 'keydown'),
			x('FunctionCall', 1_000, 4_000)
		];
		const keys = keyWork(events);
		expect(Object.fromEntries(selfTimes(events, keys))).toEqual({
			RunTask: 4,
			EventDispatch: 2,
			FunctionCall: 4
		});
	});
});

describe('summarise', () => {
	it('reports the median, p95, max and keys over a frame', () => {
		const ms = Array.from({ length: 21 }, (_, i) => i + 1);
		expect(summarise(ms)).toEqual({ n: 21, p50: 11, p95: 20, max: 21, over16: 5 });
	});
});
