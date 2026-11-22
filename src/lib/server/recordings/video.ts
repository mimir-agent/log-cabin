import { error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { SignedIn } from '../auth/session';
import { calls as strings } from '../../strings/calls';

// The composite video: the browser of whoever pressed Record draws the call to a canvas,
// records it with the mixed audio as WebM, and uploads it here in parts of at least 5 MiB
// (R2's multipart minimum, except for the last part). Audio is recorded server-side
// regardless; the video is the best the recording browser could do.

type RecordingRow = typeof schema.callRecordings.$inferSelect;

export function videoKey(recording: Pick<RecordingRow, 'id' | 'callId'>): string {
	return `calls/${recording.callId}/rec/${recording.id}/video.webm`;
}

/** The call's recording, 404ing when it isn't one of this call's. */
export async function recordingOfCall(env: Env, callId: string, recordingId: string) {
	const { callRecordings: r } = schema;
	const recording = await db(env)
		.select()
		.from(r)
		.where(and(eq(r.id, recordingId), eq(r.callId, callId)))
		.get();
	if (!recording) error(404, strings.recording.errors.notFound);
	return recording;
}

/** The recording, 403ing anyone but the person who started it: only their browser records its video. */
async function requireRecordingStarter(
	env: Env,
	who: SignedIn,
	callId: string,
	recordingId: string
) {
	const recording = await recordingOfCall(env, callId, recordingId);
	if (recording.startedBy !== who.user.id) error(403, strings.recording.errors.notRecorder);
	return recording;
}

export async function startVideo(env: Env, who: SignedIn, callId: string, recordingId: string) {
	const recording = await requireRecordingStarter(env, who, callId, recordingId);
	if (recording.status !== 'recording') error(410, strings.recording.errors.stopped);
	if (recording.videoStatus !== 'none') error(409, strings.recording.errors.videoStarted);
	const upload = await env.BUCKET.createMultipartUpload(videoKey(recording), {
		httpMetadata: { contentType: 'video/webm' }
	});
	const { callRecordings: r } = schema;
	await db(env)
		.update(r)
		.set({ videoStatus: 'uploading', videoUploadId: upload.uploadId })
		.where(eq(r.id, recording.id));
}

async function resumeVideoUpload(env: Env, who: SignedIn, callId: string, recordingId: string) {
	const recording = await requireRecordingStarter(env, who, callId, recordingId);
	if (recording.videoStatus !== 'uploading') {
		error(
			409,
			`Expected the video of recording ${recordingId} to be uploading; it is ${recording.videoStatus}`
		);
	}
	return {
		recording,
		upload: env.BUCKET.resumeMultipartUpload(videoKey(recording), recording.videoUploadId!)
	};
}

export async function uploadVideoPart(
	env: Env,
	who: SignedIn,
	callId: string,
	recordingId: string,
	partNumber: number,
	body: ArrayBuffer
) {
	if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
		error(400, `Expected a part number from 1 to 10000, got ${partNumber}`);
	}
	const { recording, upload } = await resumeVideoUpload(env, who, callId, recordingId);
	const part = await upload.uploadPart(partNumber, body);
	await db(env)
		.insert(schema.callRecordingVideoParts)
		.values({ recordingId: recording.id, partNumber, etag: part.etag })
		.onConflictDoUpdate({
			target: [
				schema.callRecordingVideoParts.recordingId,
				schema.callRecordingVideoParts.partNumber
			],
			set: { etag: part.etag }
		});
}

/**
 * Completes the upload with every part sent. A recorder that sent no parts recorded nothing, so
 * the upload is dropped and the recording has no video, rather than a video of no bytes.
 */
export async function completeVideo(env: Env, who: SignedIn, callId: string, recordingId: string) {
	const { recording, upload } = await resumeVideoUpload(env, who, callId, recordingId);
	const { callRecordingVideoParts: v, callRecordings: r } = schema;
	const parts = await db(env)
		.select({ partNumber: v.partNumber, etag: v.etag })
		.from(v)
		.where(eq(v.recordingId, recording.id))
		.orderBy(asc(v.partNumber));
	if (parts.length === 0) {
		await upload.abort();
		await db(env).update(r).set({ videoStatus: 'failed' }).where(eq(r.id, recording.id));
		return;
	}
	await upload.complete(parts);
	await db(env).update(r).set({ videoStatus: 'ready' }).where(eq(r.id, recording.id));
}

/**
 * The one byte range a Range header asks for in `size` bytes: null for the whole object (no
 * header, or one this doesn't serve, such as several ranges), 'unsatisfiable' when it starts
 * past the end. Such a range never reaches R2: given one, the deployed Worker answered 500.
 */
function byteRange(
	header: string | null,
	size: number
): { offset: number; length: number } | null | 'unsatisfiable' {
	const match = header?.match(/^bytes=(\d*)-(\d*)$/);
	if (!match || (match[1] === '' && match[2] === '')) return null;
	const [, first, last] = match;
	if (first === '') {
		const length = Math.min(Number(last), size);
		return length === 0 ? 'unsatisfiable' : { offset: size - length, length };
	}
	const offset = Number(first);
	if (offset >= size) return 'unsatisfiable';
	const end = last === '' ? size - 1 : Math.min(Number(last), size - 1);
	return end < offset ? null : { offset, length: end - offset + 1 };
}

/** The finished video, or the byte range the request asks for, so a player can seek. */
export async function videoResponse(env: Env, recording: RecordingRow, request: Request) {
	if (recording.videoStatus !== 'ready') error(404, strings.recording.errors.noVideo);
	const key = videoKey(recording);
	const stored = await env.BUCKET.head(key);
	if (!stored) throw new Error(`recording ${recording.id}: video is ready but R2 has no ${key}`);
	const range = byteRange(request.headers.get('range'), stored.size);
	const headers = new Headers({ 'accept-ranges': 'bytes', etag: stored.httpEtag });
	if (range === 'unsatisfiable') {
		headers.set('content-range', `bytes */${stored.size}`);
		return new Response(null, { status: 416, headers });
	}
	const object = await env.BUCKET.get(key, range ? { range } : {});
	if (!object) throw new Error(`recording ${recording.id}: R2 lost ${key} between head and get`);
	object.writeHttpMetadata(headers);
	if (!range) {
		headers.set('content-length', String(object.size));
		return new Response(object.body, { headers });
	}
	headers.set(
		'content-range',
		`bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`
	);
	headers.set('content-length', String(range.length));
	return new Response(object.body, { status: 206, headers });
}
