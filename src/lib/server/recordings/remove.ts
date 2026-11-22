import { and, count, eq, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db, schema } from '../db';
import type { SignedIn } from '../auth/session';
import { publish } from '../realtime/publish';
import { calls as strings } from '../../strings/calls';

/**
 * Deletes a recording's audio and video from R2, by the prefix they share. R2 deletes at most
 * 1000 keys at a time, which is also what a listing returns, so each page goes in one call. Call
 * it before deleting any row: if it stops partway, what is left is still listed and a retry finds it.
 */
export async function removeRecordingMedia(
	env: Env,
	recordingId: string,
	parts: { audio?: boolean; video?: boolean }
) {
	const recording = await db(env)
		.select({ callId: schema.callRecordings.callId })
		.from(schema.callRecordings)
		.where(eq(schema.callRecordings.id, recordingId))
		.get();
	if (!recording) throw new Error(`removeRecordingMedia: no recording ${recordingId}`);
	const prefix = `calls/${recording.callId}/rec/${recordingId}/`;
	let cursor: string | undefined;
	do {
		const page = await env.BUCKET.list({ prefix, cursor });
		const keys = page.objects
			.map((object) => object.key)
			.filter((key) => (key === `${prefix}video.webm` ? parts.video : parts.audio));
		if (keys.length) await env.BUCKET.delete(keys);
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
}

/**
 * Deletes every recording of a call: its audio and video, then its rows with their transcripts,
 * and the call's summary, which was written from them. The title stays. Only the person who
 * started the call or an admin may, and only once the call has ended and no recording is still
 * being made or processed: queued jobs would find their segments gone.
 */
export async function deleteAllRecordings(
	env: Env,
	who: SignedIn,
	call: { id: string; startedBy: string; endedAt: number | null }
) {
	if (call.startedBy !== who.user.id && who.member.role !== 'admin') {
		error(403, strings.recording.cannotDeleteAll);
	}
	const { callRecordings: r, calls } = schema;
	const unfinished = await db(env)
		.select({ n: count() })
		.from(r)
		.where(and(eq(r.callId, call.id), inArray(r.status, ['recording', 'processing'])))
		.get();
	if (call.endedAt === null || unfinished!.n > 0)
		error(409, strings.recording.errors.deleteNotReady);
	const recordings = await db(env).select({ id: r.id }).from(r).where(eq(r.callId, call.id));
	for (const { id } of recordings)
		await removeRecordingMedia(env, id, { audio: true, video: true });
	await db(env).delete(r).where(eq(r.callId, call.id));
	await db(env).update(calls).set({ summary: null }).where(eq(calls.id, call.id));
	await publish(env, `call:${call.id}`, { type: 'recording' });
}
