import { describe, expect, it } from 'vitest';
import { decodePacket, mixSegments, MonoDownsampler, TrackRecorder, wav } from './audio';

/** Protobuf varint. */
function varint(value: number): number[] {
	const out: number[] = [];
	while (value >= 0x80) {
		out.push((value % 0x80) | 0x80);
		value = Math.floor(value / 0x80);
	}
	out.push(value);
	return out;
}

/** An adapter message as the SFU sends it: sequenceNumber = 1, timestamp = 2, payload = 5. */
function packet(sequenceNumber: number, timestamp: number, payload: Uint8Array): Uint8Array {
	return new Uint8Array([
		...[0x08, ...varint(sequenceNumber)],
		...[0x10, ...varint(timestamp)],
		...[0x2a, ...varint(payload.length), ...payload]
	]);
}

/** 48 kHz stereo PCM where every left and right sample has the given values. */
function stereo(frames: [number, number][]): Uint8Array {
	const bytes = new Uint8Array(frames.length * 4);
	const view = new DataView(bytes.buffer);
	frames.forEach(([left, right], i) => {
		view.setInt16(i * 4, left, true);
		view.setInt16(i * 4 + 2, right, true);
	});
	return bytes;
}

/** 20 ms of a constant tone, the size of one adapter packet. */
const twentyMs = (value = 1000) => stereo(Array.from({ length: 960 }, () => [value, value]));

describe('decodePacket', () => {
	it('reads the sequence number, timestamp and PCM payload', () => {
		const payload = new Uint8Array([1, 2, 3, 4]);

		const decoded = decodePacket(packet(300, 4_000_000_000, payload));

		expect(decoded).toEqual({ sequenceNumber: 300, timestamp: 4_000_000_000, payload });
	});

	it('skips fields it does not know', () => {
		const unknown = [0x18, 7, 0x22, 2, 9, 9]; // field 3 varint, field 4 bytes
		const bytes = new Uint8Array([...unknown, ...packet(1, 2, new Uint8Array([5, 6]))]);

		expect(decodePacket(bytes).payload).toEqual(new Uint8Array([5, 6]));
	});

	it('names the field when the payload is cut short', () => {
		const cut = packet(1, 2, new Uint8Array(10)).subarray(0, 8);

		expect(() => decodePacket(cut)).toThrow(/field 5 needs 10 bytes/);
	});
});

describe('MonoDownsampler', () => {
	it('turns three 48 kHz stereo frames into one 16 kHz mono sample, the mean of both channels', () => {
		const pcm = stereo([
			[300, 100],
			[600, 0],
			[-300, 100],
			[30, 30],
			[60, 60],
			[90, 90]
		]);

		// (300 + 100 + 600 + 0 - 300 + 100) / 6 = 133.3, and (30 + 30 + 60 + 60 + 90 + 90) / 6 = 60.
		expect([...new MonoDownsampler().push(pcm)]).toEqual([133, 60]);
	});

	it('carries frames that do not divide by three into the next packet', () => {
		const downsampler = new MonoDownsampler();

		expect([
			...downsampler.push(
				stereo([
					[10, 10],
					[20, 20]
				])
			)
		]).toEqual([]);
		expect([...downsampler.push(stereo([[30, 30]]))]).toEqual([20]);
	});

	it('turns one 20 ms packet into 320 samples', () => {
		expect(new MonoDownsampler().push(twentyMs()).length).toBe(320);
	});
});

describe('wav', () => {
	it('writes a 44-byte header for 16 kHz 16-bit mono PCM, then the samples', () => {
		const file = wav(new Int16Array([1, -2]));
		const view = new DataView(file.buffer);
		const text = (at: number, length: number) =>
			String.fromCharCode(...file.subarray(at, at + length));

		expect(file.length).toBe(48);
		expect(text(0, 4)).toBe('RIFF');
		expect(view.getUint32(4, true)).toBe(40);
		expect(text(8, 8)).toBe('WAVEfmt ');
		expect(view.getUint16(20, true)).toBe(1);
		expect(view.getUint16(22, true)).toBe(1);
		expect(view.getUint32(24, true)).toBe(16_000);
		expect(view.getUint32(28, true)).toBe(32_000);
		expect(view.getUint16(32, true)).toBe(2);
		expect(view.getUint16(34, true)).toBe(16);
		expect(text(36, 4)).toBe('data');
		expect(view.getUint32(40, true)).toBe(4);
		expect([view.getInt16(44, true), view.getInt16(46, true)]).toEqual([1, -2]);
	});
});

describe('TrackRecorder', () => {
	// Segments of 100 ms (1,600 samples), so five 20 ms packets fill one.
	const recorder = (origin = 0) => new TrackRecorder(origin, 0, 1_600);
	const send = (track: TrackRecorder, count: number, from: number) =>
		Array.from({ length: count }, (_, i) =>
			track.receive(packet(i, 0, twentyMs()), from + i * 20)
		).flat();

	it('closes a segment each time one fills, numbered in order and timed from the recording start', () => {
		const track = recorder(1_000);

		const closed = send(track, 12, 1_500);

		expect(closed.map(({ seq, startMs, samples }) => [seq, startMs, samples.length])).toEqual([
			[0, 500, 1_600],
			[1, 600, 1_600]
		]);
		expect(
			track.flush().map(({ seq, startMs, samples }) => [seq, startMs, samples.length])
		).toEqual([[2, 700, 640]]);
	});

	it('fills a short pause with silence so later speech keeps its time', () => {
		const track = new TrackRecorder(0, 0, 16_000);
		track.receive(packet(0, 0, twentyMs()), 0);

		// Arrives at 520 ms, so it covers 500–520 ms: 480 ms after the first packet ended.
		track.receive(packet(1, 0, twentyMs()), 520);
		const [segment] = track.flush();

		expect(segment.samples.length).toBe(320 + 480 * 16 + 320);
		expect(segment.samples[320 + 480 * 16 - 1]).toBe(0);
		expect(segment.samples[320 + 480 * 16]).toBe(1000);
	});

	it('ends the segment at a long gap and starts the next where the audio resumes', () => {
		const track = recorder();
		send(track, 2, 0);

		const atGap = track.receive(packet(2, 0, twentyMs()), 10_040);
		const [after] = track.flush();

		expect(atGap.map((s) => [s.seq, s.startMs, s.samples.length])).toEqual([[0, 0, 640]]);
		// The packet that arrived at 10,040 ms is the 20 ms before it.
		expect([after.seq, after.startMs, after.samples.length]).toEqual([1, 10_020, 320]);
	});

	it('drops a segment of pure silence, as a muted microphone sends', () => {
		const track = recorder();
		track.receive(packet(0, 0, twentyMs(0)), 0);

		expect(track.flush()).toEqual([]);
	});
});

describe('mixSegments', () => {
	const file = (samples: number[]) => wav(new Int16Array(samples)).slice().buffer;

	it("plays each speaker's segment at its time, adding speech that overlaps and clipping it", () => {
		// One sample is 1/16 ms, so a segment at 0.125 ms starts two samples in.
		const mixed = mixSegments([
			{ startMs: 0, file: file([1, 2, 30_000]) },
			{ startMs: 0.125, file: file([10, 20_000, 7]) }
		]);

		expect([...mixed]).toEqual([1, 2, 30_010, 20_000, 7].map((s) => Math.min(s, 32_767)));
	});
});
