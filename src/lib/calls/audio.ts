// Audio for call recordings, with no runtime dependency, so the recording sink and the
// browser that plays a recording share it. The SFU's WebSocket adapter sends each track as
// protobuf packets of 48 kHz stereo PCM; recordings keep 16 kHz mono, which is what speech
// recognition takes, in WAV segments of a minute.
// Packet format: https://developers.cloudflare.com/realtime/sfu/features/media-transport-adapters/websocket-adapter/

/** The rate recordings are stored at, in samples per second. */
export const sampleRate = 16_000;
const samplesPerMs = sampleRate / 1000;
/** A segment holds a minute of one person's audio. */
export const segmentSamples = 60 * sampleRate;
/** A gap in a track up to this long is kept as silence; a longer one ends the segment. */
const maxPaddedGapMs = 2_000;
/** Packets arrive with network jitter; a gap shorter than this isn't one. */
const jitterMs = 200;

export type Packet = { sequenceNumber: number; timestamp: number; payload: Uint8Array };

/**
 * Decodes one adapter message: `message Packet { uint32 sequenceNumber = 1; uint32 timestamp = 2;
 * bytes payload = 5; }`. Fields it doesn't know are skipped, as protobuf requires.
 */
export function decodePacket(bytes: Uint8Array): Packet {
	const packet: Packet = { sequenceNumber: 0, timestamp: 0, payload: new Uint8Array() };
	let at = 0;
	const varint = () => {
		let value = 0;
		for (let shift = 0; ; shift += 7) {
			if (at >= bytes.length) throw new Error(`decodePacket: varint runs past byte ${at}`);
			const byte = bytes[at++];
			value += (byte & 0x7f) * 2 ** shift;
			if (byte < 0x80) return value;
		}
	};
	while (at < bytes.length) {
		const key = varint();
		const field = Math.floor(key / 8);
		const wireType = key % 8;
		if (wireType === 0) {
			const value = varint();
			if (field === 1) packet.sequenceNumber = value;
			if (field === 2) packet.timestamp = value;
		} else if (wireType === 2) {
			const length = varint();
			if (at + length > bytes.length) {
				throw new Error(
					`decodePacket: field ${field} needs ${length} bytes, ${bytes.length - at} left`
				);
			}
			if (field === 5) packet.payload = bytes.subarray(at, at + length);
			at += length;
		} else if (wireType === 1 || wireType === 5) {
			at += wireType === 1 ? 8 : 4;
		} else {
			throw new Error(
				`decodePacket: expected wire type 0, 1, 2 or 5, got ${wireType} at byte ${at}`
			);
		}
	}
	return packet;
}

/**
 * Turns 48 kHz stereo signed 16-bit little-endian PCM into 16 kHz mono: each output sample is the
 * mean of three stereo frames, both channels. Averaging is the low-pass that keeps the drop to
 * 16 kHz from folding high frequencies into speech. A packet whose frames don't divide by three
 * leaves the rest for the next one.
 */
export class MonoDownsampler {
	private carry: number[] = [];

	push(pcm: Uint8Array): Int16Array {
		if (pcm.length % 4 !== 0) {
			throw new Error(
				`MonoDownsampler: expected whole stereo frames of 4 bytes, got ${pcm.length} bytes`
			);
		}
		const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
		const frames = [...this.carry];
		for (let at = 0; at < pcm.length; at += 4) {
			frames.push(view.getInt16(at, true) + view.getInt16(at + 2, true));
		}
		const out = new Int16Array(Math.floor(frames.length / 3));
		for (let i = 0; i < out.length; i++) {
			out[i] = Math.round((frames[3 * i] + frames[3 * i + 1] + frames[3 * i + 2]) / 6);
		}
		this.carry = frames.slice(out.length * 3);
		return out;
	}
}

/** A 16-bit mono PCM WAV file of the samples at `rate`. */
export function wav(samples: Int16Array, rate = sampleRate): Uint8Array {
	const bytes = new Uint8Array(44 + samples.length * 2);
	const view = new DataView(bytes.buffer);
	const ascii = (at: number, text: string) =>
		[...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
	ascii(0, 'RIFF');
	view.setUint32(4, 36 + samples.length * 2, true);
	ascii(8, 'WAVE');
	ascii(12, 'fmt ');
	view.setUint32(16, 16, true); // fmt chunk size
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, rate, true);
	view.setUint32(28, rate * 2, true); // bytes per second
	view.setUint16(32, 2, true); // bytes per frame
	view.setUint16(34, 16, true); // bits per sample
	ascii(36, 'data');
	view.setUint32(40, samples.length * 2, true);
	samples.forEach((sample, i) => view.setInt16(44 + i * 2, sample, true));
	return bytes;
}

/**
 * Lays every speaker's segments on one timeline and adds them, for playing a recording back:
 * the samples of a WAV that `wav()` wrote start at byte 44. Overlapping speech is summed and
 * clipped to 16 bits.
 */
export function mixSegments(segments: { startMs: number; file: ArrayBuffer }[]): Int16Array {
	const tracks = segments.map(({ startMs, file }) => ({
		at: Math.round(startMs * samplesPerMs),
		samples: new Int16Array(file, 44)
	}));
	const length = Math.max(0, ...tracks.map((t) => t.at + t.samples.length));
	const sum = new Int32Array(length);
	for (const { at, samples } of tracks) samples.forEach((s, i) => (sum[at + i] += s));
	return Int16Array.from(sum, (s) => Math.max(-32768, Math.min(32767, s)));
}

/** A closed segment of one track: its number, where it starts in the recording, and its audio. */
export type Segment = { seq: number; startMs: number; samples: Int16Array };

/**
 * One person's track, cut into segments of `size` samples. Time comes from when packets
 * arrive, because a muted or silent microphone may send nothing: a short gap is filled with
 * silence so speech keeps its place, a long one ends the segment and the next starts where
 * the audio resumes. A segment of pure silence (a muted track's zeros) is dropped.
 */
export class TrackRecorder {
	private downsampler = new MonoDownsampler();
	private parts: Int16Array[] = [];
	private buffered = 0;
	/** Samples since the first packet, kept or skipped. */
	private position = 0;
	private segmentStart = 0;
	private firstAt: number | null = null;

	/**
	 * `origin` is when the recording started; segment times count from it. `seq` is the next
	 * segment's number: a sink that restarted mid-track carries on after the segments it saved.
	 */
	constructor(
		private origin: number,
		private seq = 0,
		private size = segmentSamples
	) {}

	/** Takes one adapter message that arrived at `now`, and returns the segments it closed. */
	receive(message: Uint8Array, now: number): Segment[] {
		const samples = this.downsampler.push(decodePacket(message).payload);
		this.firstAt ??= now;
		const closed: Segment[] = [];
		const gapMs = now - this.firstAt - (this.position + samples.length) / samplesPerMs;
		if (gapMs > maxPaddedGapMs) {
			closed.push(...this.flush());
			this.position += Math.round(gapMs * samplesPerMs);
		} else if (gapMs > jitterMs) {
			closed.push(...this.append(new Int16Array(Math.round(gapMs * samplesPerMs))));
		}
		closed.push(...this.append(samples));
		return closed;
	}

	private append(samples: Int16Array): Segment[] {
		const closed: Segment[] = [];
		let from = 0;
		while (from < samples.length) {
			if (this.buffered === 0) this.segmentStart = this.position;
			const take = Math.min(samples.length - from, this.size - this.buffered);
			this.parts.push(samples.subarray(from, from + take));
			this.buffered += take;
			this.position += take;
			from += take;
			if (this.buffered === this.size) closed.push(...this.flush());
		}
		return closed;
	}

	/** Closes the segment in progress: when it fills, at a long gap, and when the track ends. */
	flush(): Segment[] {
		if (this.buffered === 0) return [];
		const samples = new Int16Array(this.buffered);
		let at = 0;
		for (const part of this.parts) {
			samples.set(part, at);
			at += part.length;
		}
		this.parts = [];
		this.buffered = 0;
		if (samples.every((s) => s === 0)) return [];
		const startMs = this.firstAt! - this.origin + Math.round(this.segmentStart / samplesPerMs);
		return [{ seq: this.seq++, startMs, samples }];
	}
}
