import { DurableObject } from 'cloudflare:workers';
import { and, eq, max } from 'drizzle-orm';
import { db, schema } from '../db';
import { newId } from '../id';
import { emit } from '../events';
import { sampleRate, TrackRecorder, wav, type Segment } from '../../calls/audio';
import { isSinkToken } from './recordings';

// Files imported by src/worker.ts use relative imports (SYSTEMS_MAP, Worker runtime).

/** What the Worker tells a sink about the track it records, once it checked the token. */
export type SinkInit = {
	recordingId: string;
	callId: string;
	participantId: string;
	trackId: string;
	/** When the recording started; segment times count from it. */
	origin: number;
};

/** The header that carries SinkInit, as JSON, on the upgrade the Worker forwards. */
export const sinkInitHeader = 'x-campfire-recording-sink';

const sinkPath = /^\/calls\/([^/]+)\/rec-sink$/;

export function isRecordingSinkPath(pathname: string): boolean {
	return sinkPath.test(pathname);
}

/**
 * GET /calls/<id>/rec-sink?track=…&token=…: the SFU's adapter connecting with one person's
 * audio. The token must be the recording's, the recording must be running and the track
 * open; then the socket goes to that track's RecordingSink. Nothing here logs the URL.
 */
export async function connectRecordingSink(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	if (request.headers.get('upgrade') !== 'websocket') {
		return new Response('rec-sink expects a WebSocket upgrade', { status: 426 });
	}
	const callId = sinkPath.exec(url.pathname)![1];
	const trackId = url.searchParams.get('track') ?? '';
	const token = url.searchParams.get('token') ?? '';
	const { callRecordings: r, callRecordingTracks: t } = schema;
	const row = await db(env)
		.select({ track: t, recording: r })
		.from(t)
		.innerJoin(r, eq(r.id, t.recordingId))
		.where(and(eq(t.id, trackId), eq(r.callId, callId)))
		.get();
	if (!row || !(await isSinkToken(env, row.recording.id, token))) {
		return new Response('rec-sink: unknown track or wrong token', { status: 403 });
	}
	if (row.recording.status !== 'recording' || row.track.closedAt !== null) {
		return new Response('rec-sink: this track is no longer being recorded', { status: 403 });
	}
	const init: SinkInit = {
		recordingId: row.recording.id,
		callId,
		participantId: row.track.participantId,
		trackId,
		origin: row.recording.startedAt
	};
	// A fresh request, so the token in the URL goes no further than this check.
	const headers = new Headers({ upgrade: 'websocket', [sinkInitHeader]: JSON.stringify(init) });
	const sink = env.RECORDING_SINK.get(env.RECORDING_SINK.idFromName(trackId));
	return sink.fetch(new Request('https://recording-sink/', { headers }));
}

/** Where a segment's WAV lives in R2. */
export function segmentKey(init: SinkInit, seq: number): string {
	return `calls/${init.callId}/rec/${init.recordingId}/${init.participantId}/${seq}.wav`;
}

/** Stores a closed segment in R2 and the database, and queues its transcription. */
export async function saveSegment(env: Env, init: SinkInit, segment: Segment, now = Date.now()) {
	const key = segmentKey(init, segment.seq);
	await env.BUCKET.put(key, wav(segment.samples), { httpMetadata: { contentType: 'audio/wav' } });
	const id = newId(now);
	await db(env)
		.insert(schema.callRecordingSegments)
		.values({
			id,
			recordingId: init.recordingId,
			trackId: init.trackId,
			seq: segment.seq,
			r2Key: key,
			startMs: segment.startMs,
			durationMs: Math.round((segment.samples.length * 1000) / sampleRate),
			createdAt: now
		});
	await emit(env, {
		kind: 'recording.segment',
		segmentId: id,
		recordingId: init.recordingId,
		callId: init.callId
	});
}

/**
 * Receives one person's audio from the SFU for one recording (one instance per track) and
 * writes it as minute-long segments. The socket is accepted without hibernation: the audio
 * in progress lives in memory, and the instance stays in memory while the socket is open.
 * When the SFU reconnects (it retries the same URL for 15 s) the same instance carries on.
 */
export class RecordingSink extends DurableObject<Env> {
	private recorder: Promise<TrackRecorder> | undefined;

	async fetch(request: Request): Promise<Response> {
		const init = JSON.parse(request.headers.get(sinkInitHeader)!) as SinkInit;
		this.recorder ??= nextSegmentSeq(this.env, init.trackId).then(
			(seq) => new TrackRecorder(init.origin, seq)
		);
		const recorder = await this.recorder;
		const [client, server] = Object.values(new WebSocketPair());
		server.accept();
		// Under this compatibility date binary messages arrive as Blobs unless asked otherwise.
		server.binaryType = 'arraybuffer';
		const save = (segments: Segment[]) => {
			for (const segment of segments) this.ctx.waitUntil(saveSegment(this.env, init, segment));
		};
		server.addEventListener('message', (event) => {
			if (!(event.data instanceof ArrayBuffer)) {
				throw new Error(
					`RecordingSink ${init.trackId}: expected a binary packet as an ArrayBuffer, got ${Object.prototype.toString.call(event.data)}`
				);
			}
			save(recorder.receive(new Uint8Array(event.data), Date.now()));
		});
		server.addEventListener('close', () => save(recorder.flush()));
		return new Response(null, { status: 101, webSocket: client });
	}
}

/**
 * The number of a track's next segment: 0 for a new track, and after the last saved one for a
 * sink whose instance was evicted mid-track and started again.
 */
export async function nextSegmentSeq(env: Env, trackId: string): Promise<number> {
	const { callRecordingSegments: s } = schema;
	const last = await db(env)
		.select({ seq: max(s.seq) })
		.from(s)
		.where(eq(s.trackId, trackId))
		.get();
	return (last?.seq ?? -1) + 1;
}
