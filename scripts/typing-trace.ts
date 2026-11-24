// Reads a Chrome trace of someone typing and works out what each keystroke cost the main thread.
// tests/perf/typing.spec.ts records the trace and prints these numbers.

/** The fields of a trace event this file reads. Times are in microseconds. */
export type TraceEvent = {
	ph: string;
	name: string;
	ts: number;
	dur?: number;
	pid: number;
	tid: number;
	args?: { data?: { type?: string } };
};

type Slice = { name: string; start: number; end: number; thread: string; type?: string };

export type Summary = { n: number; p50: number; p95: number; max: number; over16: number };

/** One key's main-thread time in ms, and whether the layout after it was found. */
export type Key = { ms: number; laidOut: boolean; start: number; end: number; thread: string };

/** The complete events, and the begin/end pairs joined into one, of every thread. */
function slicesOf(events: TraceEvent[]): Slice[] {
	const slices: Slice[] = [];
	const open = new Map<string, Slice[]>();
	for (const e of events) {
		const thread = `${e.pid}:${e.tid}`;
		const type = e.args?.data?.type;
		if (e.ph === 'X') {
			slices.push({ name: e.name, start: e.ts, end: e.ts + (e.dur ?? 0), thread, type });
		} else if (e.ph === 'B') {
			const stack = open.get(thread) ?? [];
			stack.push({ name: e.name, start: e.ts, end: e.ts, thread, type });
			open.set(thread, stack);
		} else if (e.ph === 'E') {
			const slice = open.get(thread)?.pop();
			if (slice) slices.push({ ...slice, end: e.ts });
		}
	}
	return slices.sort((a, b) => a.start - b.start || b.end - a.end);
}

const keyEvents = new Set(['keydown', 'keypress', 'beforeinput', 'textInput', 'input']);

/**
 * For each `keydown`, the main-thread time from its EventDispatch to the later of two ends: the
 * last Layout or UpdateLayoutTree before the next Paint, and the last key event handler
 * (keydown, keypress, beforeinput, textInput, input) before the next keydown. A layout forced
 * inside the keypress comes before the handlers that follow it, so the layout alone ends early.
 * This is the work the key makes the thread do, not the frame: the Paint after it is not counted.
 * It is the time the thread was busy in that stretch (slices that overlap count once), not the
 * wall-clock gap.
 */
export function keyWork(events: TraceEvent[]): Key[] {
	const slices = slicesOf(events);
	const downs = slices.filter((s) => s.name === 'EventDispatch' && s.type === 'keydown');
	const threads = new Set(downs.map((d) => d.thread));
	if (threads.size !== 1) {
		throw new Error(
			`Expected the keydowns on one main thread, found them on ${threads.size}: ${[...threads].join(', ')}`
		);
	}
	const thread = slices.filter((s) => s.thread === downs[0].thread);
	return downs.map((down, i) => {
		const limit = downs[i + 1]?.start ?? Infinity;
		const after = thread.filter((s) => s.start > down.start && s.start < limit);
		const paint = after.find((s) => s.name === 'Paint')?.start ?? limit;
		const layouts = thread.filter(
			(s) =>
				(s.name === 'Layout' || s.name === 'UpdateLayoutTree') &&
				s.start >= down.start &&
				s.start < paint
		);
		const laidOut = layouts.length > 0;
		const handlers = after.filter((s) => s.name === 'EventDispatch' && keyEvents.has(s.type ?? ''));
		const end = Math.max(down.end, ...layouts.map((s) => s.end), ...handlers.map((s) => s.end));
		let covered = down.start;
		let busy = 0;
		for (const s of thread) {
			if (s.end <= down.start || s.start >= end) continue;
			const to = Math.min(s.end, end);
			const from = Math.max(s.start, covered);
			if (to > from) {
				busy += to - from;
				covered = to;
			}
		}
		return { ms: busy / 1000, laidOut, start: down.start, end, thread: down.thread };
	});
}

/**
 * Where the keys' time went: the time each kind of trace event spent itself, outside the events
 * nested in it, averaged per key in ms, largest first.
 */
export function selfTimes(events: TraceEvent[], keys: Key[]): [string, number][] {
	const thread = slicesOf(events).filter((s) => s.thread === keys[0].thread);
	const totals = new Map<string, number>();
	const stack: { slice: Slice; children: number }[] = [];
	const close = () => {
		const { slice, children } = stack.pop()!;
		totals.set(slice.name, (totals.get(slice.name) ?? 0) + (slice.end - slice.start - children));
		if (stack.length) stack.at(-1)!.children += slice.end - slice.start;
	};
	for (const s of thread) {
		while (stack.length && stack.at(-1)!.slice.end <= s.start) close();
		if (keys.some((k) => s.start >= k.start && s.start < k.end))
			stack.push({ slice: s, children: 0 });
	}
	while (stack.length) close();
	return [...totals]
		.map(([name, us]): [string, number] => [name, us / 1000 / keys.length])
		.sort((a, b) => b[1] - a[1]);
}

const percentile = (sorted: number[], q: number) => {
	const at = (sorted.length - 1) * q;
	const low = Math.floor(at);
	return sorted[low] + (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * (at - low);
};

export function summarise(ms: number[]): Summary {
	const sorted = [...ms].sort((a, b) => a - b);
	return {
		n: sorted.length,
		p50: percentile(sorted, 0.5),
		p95: percentile(sorted, 0.95),
		max: sorted.at(-1)!,
		over16: sorted.filter((x) => x > 16).length
	};
}
