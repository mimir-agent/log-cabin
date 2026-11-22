// Who's speaking, for the active-speaker layout. Each source's audio level is sampled ten
// times a second; the speaker is whoever is loudest over the last windowMs. To keep the big
// tile from flickering between two people talking over each other, someone takes it only
// when clearly louder than the current speaker, and a speaker who goes quiet keeps it.

const windowMs = 300;
/** RMS level below which a sample counts as silence. */
const silence = 0.01;
/** How much louder than the current speaker someone must be to take over. */
const takeover = 1.5;

export class SpeakerTracker {
	private samples = new Map<string, { at: number; level: number }[]>();
	current: string | null = null;

	/** Adds one level reading per source and returns who is speaking now. */
	update(levels: Map<string, number>, now: number): string | null {
		for (const [key, level] of levels) {
			const recent = (this.samples.get(key) ?? []).filter((s) => s.at > now - windowMs);
			recent.push({ at: now, level });
			this.samples.set(key, recent);
		}
		for (const key of this.samples.keys()) if (!levels.has(key)) this.samples.delete(key);
		if (this.current !== null && !levels.has(this.current)) this.current = null;

		const average = (key: string) => {
			const recent = this.samples.get(key) ?? [];
			return recent.reduce((sum, s) => sum + s.level, 0) / Math.max(recent.length, 1);
		};
		let loudest: string | null = null;
		for (const key of levels.keys()) {
			if (average(key) > silence && (loudest === null || average(key) > average(loudest))) {
				loudest = key;
			}
		}
		if (loudest === null || loudest === this.current) return this.current;
		if (this.current === null || average(loudest) > average(this.current) * takeover) {
			this.current = loudest;
		}
		return this.current;
	}
}

/** Reads a stream's audio level (RMS, 0 to 1) whenever asked. Call stop when done. */
function levelMeter(context: AudioContext, stream: MediaStream) {
	const source = context.createMediaStreamSource(stream);
	const analyser = context.createAnalyser();
	analyser.fftSize = 512;
	source.connect(analyser);
	const buffer = new Float32Array(analyser.fftSize);
	return {
		level() {
			analyser.getFloatTimeDomainData(buffer);
			let sum = 0;
			for (const sample of buffer) sum += sample * sample;
			return Math.sqrt(sum / buffer.length);
		},
		stop() {
			source.disconnect();
		}
	};
}

/**
 * Listens to each source's audio in the browser and calls onSpeaker with whoever is talking.
 * Sources are keyed by tile; call watch with the current list whenever it changes.
 */
export class SpeakerWatch {
	private context: AudioContext | null = null;
	private meters = new Map<string, { stream: MediaStream; meter: ReturnType<typeof levelMeter> }>();
	private tracker = new SpeakerTracker();
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(private onSpeaker: (key: string | null) => void) {}

	watch(sources: [key: string, stream: MediaStream][]) {
		const context = (this.context ??= new AudioContext());
		const wanted = new Map(sources);
		for (const [key, { stream, meter }] of this.meters) {
			if (wanted.get(key) !== stream) {
				meter.stop();
				this.meters.delete(key);
			}
		}
		for (const [key, stream] of wanted) {
			if (!this.meters.has(key))
				this.meters.set(key, { stream, meter: levelMeter(context, stream) });
		}
		this.timer ??= setInterval(() => {
			const levels = new Map([...this.meters].map(([key, { meter }]) => [key, meter.level()]));
			this.onSpeaker(this.tracker.update(levels, performance.now()));
		}, 100);
	}

	stop() {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		for (const { meter } of this.meters.values()) meter.stop();
		this.meters.clear();
		this.context?.close();
		this.context = null;
		this.onSpeaker(null);
	}
}
