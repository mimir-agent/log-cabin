import { and, eq, inArray, isNotNull, lt, or } from 'drizzle-orm';
import { db, schema } from '../db';
import { endRecording } from './recordings';
import { summarizeCallIfDone } from './transcripts';

/** A recording still not finished this long after it stopped is stuck. */
export const stuckAfterMs = 2 * 60 * 60_000;

/** The longest a recording runs. The hourly check stops it, so it stops within the hour after. */
export const maxRecordingMs = 4 * 60 * 60_000;

/**
 * Part of the hourly check: stops, as Stop does, every recording that has run `maxRecordingMs`
 * (a call lasts as long as anyone's tab stays open, and each minute costs transcription), and
 * any whose call ended without stopping it (an end that failed partway).
 */
export async function stopOverdueRecordings(env: Env, now: number): Promise<void> {
	const { callRecordings: r, calls } = schema;
	const overdue = await db(env)
		.select({ callId: r.callId })
		.from(r)
		.innerJoin(calls, eq(calls.id, r.callId))
		.where(
			and(
				eq(r.status, 'recording'),
				or(lt(r.startedAt, now - maxRecordingMs), isNotNull(calls.endedAt))
			)
		);
	for (const { callId } of overdue) await endRecording(env, callId, now);
}

/**
 * The hourly health check: marks failed every recording still processing `stuckAfterMs` after
 * it stopped, with its untranscribed segments and its unfinished video, so the call page says
 * so instead of "writing the transcript" forever. What was saved stays readable, and an ended
 * call that was waiting on it is summarized from it.
 */
export async function failStuckRecordings(env: Env, now: number): Promise<void> {
	const { callRecordings: r, callRecordingSegments: s } = schema;
	const stuck = await db(env)
		.update(r)
		.set({ status: 'failed', failure: 'stuck' })
		.where(and(eq(r.status, 'processing'), lt(r.stoppedAt, now - stuckAfterMs)))
		.returning({ id: r.id, callId: r.callId });
	if (stuck.length === 0) return;
	const ids = stuck.map((rec) => rec.id);
	for (const id of ids) {
		console.error(
			`recording ${id}: still processing after ${stuckAfterMs / 60_000} minutes; marked failed`
		);
	}
	await db(env)
		.update(r)
		.set({ videoStatus: 'failed' })
		.where(and(inArray(r.id, ids), eq(r.videoStatus, 'uploading')));
	await db(env)
		.update(s)
		.set({ status: 'failed' })
		.where(and(inArray(s.recordingId, ids), eq(s.status, 'pending')));
	for (const callId of new Set(stuck.map((rec) => rec.callId))) {
		await summarizeCallIfDone(env, callId);
	}
}
