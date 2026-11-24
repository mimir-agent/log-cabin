import { error } from '@sveltejs/kit';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { newId } from '../id';
import { emit } from '../events';
import { publish } from '../realtime/publish';
import { canWriteInProject, loadProject } from '../posts/access';
import { isThreadMember } from '../chat/threads';
import { aiConfigured } from '../ai/summaries';
import { getOrg } from '../org';
import type { SignedIn } from '../auth/session';
import type { CallPlace } from '../calls/places';
import * as sfu from '../calls/sfu';
import { calls as strings } from '../../strings/calls';

type RecordingRow = typeof schema.callRecordings.$inferSelect;
type TrackRow = typeof schema.callRecordingTracks.$inferSelect;

/**
 * How long after a recording stops its sinks have to write and queue their last segments. The
 * SFU closes an adapter's socket as the close request returns, and a sink writes on close, so
 * until that write is queued "no segment is pending" proves nothing. 30 s is a margin chosen to
 * cover the write and its queueing; a segment saved later is still transcribed but may miss the
 * summary.
 */
export const flushGraceMs = 30_000;

/**
 * Recording needs calls, Workers AI for transcripts, a public URL the SFU can reach the sinks
 * at, and the secret their tokens are signed with.
 */
export function recordingAvailable(env: Env): boolean {
	return sfu.callsEnabled(env) && aiConfigured(env) && !!env.APP_URL && !!env.SESSION_SECRET;
}

/** Who may start or stop a recording: whoever may post in the call's place. */
export async function canRecord(env: Env, who: SignedIn, place: CallPlace): Promise<boolean> {
	switch (place.kind) {
		case 'project':
			return canWriteInProject(who.member, await loadProject(env, who, place.id));
		case 'thread':
			return isThreadMember(env, place.id, who.user.id);
		case 'room':
			return (
				place.id === who.user.id || who.member.role === 'member' || who.member.role === 'admin'
			);
	}
}

async function sinkKey(env: Env): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(`recording sink:${env.SESSION_SECRET}`),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}

const base64url = (bytes: Uint8Array) =>
	btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

/**
 * The token in a recording's sink URLs: an HMAC of its id, so it holds for the recording's
 * whole life (the SFU reconnects with the same URL) and every late joiner's adapter gets the
 * same one. Only the SFU sees it: it never goes to a browser or a log.
 */
export async function sinkToken(env: Env, recordingId: string): Promise<string> {
	const mac = await crypto.subtle.sign(
		'HMAC',
		await sinkKey(env),
		new TextEncoder().encode(recordingId)
	);
	return base64url(new Uint8Array(mac));
}

/** Whether `token` is this recording's sink token, compared in constant time. */
export async function isSinkToken(env: Env, recordingId: string, token: string): Promise<boolean> {
	if (!/^[\w-]{43}$/.test(token)) return false;
	const base64 = token.replace(/-/g, '+').replace(/_/g, '/') + '=';
	const mac = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
	return crypto.subtle.verify(
		'HMAC',
		await sinkKey(env),
		mac,
		new TextEncoder().encode(recordingId)
	);
}

async function sinkUrl(env: Env, recording: RecordingRow, trackId: string): Promise<string> {
	const base = env.APP_URL!.replace(/\/$/, '').replace(/^http/, 'ws');
	const token = await sinkToken(env, recording.id);
	return `${base}/calls/${recording.callId}/rec-sink?track=${trackId}&token=${token}`;
}

/** The call's recording that is running, or null. */
export function activeRecording(env: Env, callId: string): Promise<RecordingRow | undefined> {
	const { callRecordings: r } = schema;
	return db(env)
		.select()
		.from(r)
		.where(and(eq(r.callId, callId), eq(r.status, 'recording')))
		.get();
}

async function assertCanRecord(env: Env, who: SignedIn, call: { place: CallPlace }) {
	if (!(await canRecord(env, who, call.place))) error(403, strings.recording.errors.cannotRecord);
}

/**
 * Starts recording a live call, by hand: only when the org lets people decide (Ask).
 * Returns the running recording when there already is one.
 */
export async function startRecording(
	env: Env,
	who: SignedIn,
	call: { id: string; endedAt: number | null; place: CallPlace },
	now = Date.now()
): Promise<string> {
	if (!recordingAvailable(env)) error(404, strings.recording.errors.unavailable);
	if (call.endedAt !== null) error(410, strings.errors.ended);
	await assertCanRecord(env, who, call);
	const { callRecording } = await getOrg(env);
	if (callRecording !== 'ask') error(403, strings.recording.errors.notAsked(callRecording));
	return openRecording(env, call.id, who.user.id, false, now);
}

/** Whether the org records every call from its start, and recording is set up to do it. */
export async function recordsEveryCall(env: Env): Promise<boolean> {
	return recordingAvailable(env) && (await getOrg(env)).callRecording === 'on';
}

/**
 * Starts the recording the org's setting asks for, in a call that was just started: its
 * starter is recorded as who started it, marked automatic.
 */
export async function startAutoRecording(
	env: Env,
	call: { id: string; startedBy: string },
	now = Date.now()
): Promise<void> {
	if (await recordsEveryCall(env)) await openRecording(env, call.id, call.startedBy, true, now);
}

async function openRecording(
	env: Env,
	callId: string,
	startedBy: string,
	auto: boolean,
	now: number
): Promise<string> {
	const [created] = await db(env)
		.insert(schema.callRecordings)
		.values({ id: newId(now), callId, startedBy, auto, startedAt: now })
		.onConflictDoNothing()
		.returning();
	if (!created) return (await activeRecording(env, callId))!.id;
	const opened = await syncRecording(env, callId, now);
	if (opened.tried > 0 && opened.ok === 0) {
		await db(env).delete(schema.callRecordings).where(eq(schema.callRecordings.id, created.id));
		error(502, strings.recording.errors.sfuRefused);
	}
	await publish(env, `call:${callId}`, { type: 'recording' });
	return created.id;
}

/** Stops the call's running recording, for someone who may record in its place. With On, nobody may: every call records. */
export async function stopRecording(
	env: Env,
	who: SignedIn,
	call: { id: string; place: CallPlace },
	now = Date.now()
): Promise<void> {
	await assertCanRecord(env, who, call);
	if ((await getOrg(env)).callRecording === 'on') error(403, strings.recording.errors.alwaysOn);
	await endRecording(env, call.id, now);
}

/**
 * Stops the call's running recording, if any: its adapters close, and once the sinks have
 * written their last segments and every segment is transcribed it is ready (transcripts.ts).
 * Ending the call calls this too.
 */
export async function endRecording(env: Env, callId: string, now = Date.now()): Promise<void> {
	const { callRecordings: r, callRecordingTracks: t } = schema;
	const [stopped] = await db(env)
		.update(r)
		.set({ status: 'processing', stoppedAt: now })
		.where(and(eq(r.callId, callId), eq(r.status, 'recording')))
		.returning();
	if (!stopped) return;
	const open = await db(env)
		.select()
		.from(t)
		.where(and(eq(t.recordingId, stopped.id), isNull(t.closedAt)));
	await closeTracks(env, open, now);
	await emit(
		env,
		{ kind: 'recording.stopped', recordingId: stopped.id, callId },
		{ delaySeconds: flushGraceMs / 1000 }
	);
	await publish(env, `call:${callId}`, { type: 'recording' });
}

/**
 * Brings the running recording's adapters in line with who is in the call: one for each
 * person publishing a microphone, none for anyone who left. Called whenever that changes.
 * Says how many adapters it asked the SFU for and how many it got.
 */
export async function syncRecording(env: Env, callId: string, now = Date.now()) {
	const recording = await activeRecording(env, callId);
	if (!recording) return { tried: 0, ok: 0 };
	const { callParticipants: p, callRecordingTracks: t } = schema;
	const speaking = await db(env)
		.select({ id: p.id, sessionId: p.sessionId })
		.from(p)
		.where(
			and(
				eq(p.callId, callId),
				isNull(p.leftAt),
				sql`EXISTS (SELECT 1 FROM json_each(${p.tracks}) WHERE value = 'audio')`
			)
		);
	const open = await db(env)
		.select()
		.from(t)
		.where(and(eq(t.recordingId, recording.id), isNull(t.closedAt)));
	const gone = open.filter((track) => !speaking.some((s) => s.id === track.participantId));
	await closeTracks(env, gone, now);
	const fresh = speaking.filter((s) => !open.some((track) => track.participantId === s.id));
	return openTracks(env, recording, fresh, now);
}

/**
 * Asks the SFU for an adapter per person. Each track row is written before the request, so
 * the sink route knows the track when the SFU connects, and is closed with the SFU's error if
 * its adapter failed: that person's audio is missing from the recording, and the call goes on.
 */
async function openTracks(
	env: Env,
	recording: RecordingRow,
	people: { id: string; sessionId: string }[],
	now: number
) {
	if (people.length === 0) return { tried: 0, ok: 0 };
	const { callRecordingTracks: t } = schema;
	// Two requests syncing at once both see the person without a track; the index lets one in.
	const rows = await db(env)
		.insert(t)
		.values(
			people.map((p) => ({
				id: newId(now),
				recordingId: recording.id,
				participantId: p.id,
				openedAt: now
			}))
		)
		.onConflictDoNothing()
		.returning();
	let ok = 0;
	for (let i = 0; i < rows.length; i += sfu.adapterBatch) {
		const batch = rows.slice(i, i + sfu.adapterBatch);
		const requests = await Promise.all(
			batch.map(async (row) => ({
				sessionId: people.find((p) => p.id === row.participantId)!.sessionId,
				trackName: 'audio',
				endpoint: await sinkUrl(env, recording, row.id)
			}))
		);
		let results: sfu.AdapterResult[];
		try {
			results = (await sfu.newAudioAdapters(env, requests)).tracks;
		} catch (e) {
			results = batch.map(() => ({ errorCode: e instanceof Error ? e.message : String(e) }));
		}
		for (const [j, row] of batch.entries()) {
			const result = results[j];
			if (result?.adapterId) {
				ok++;
				await db(env).update(t).set({ adapterId: result.adapterId }).where(eq(t.id, row.id));
			} else {
				const problem = sfu.redactSinkTokens(
					`${result?.errorCode ?? 'no result'} ${result?.errorDescription ?? ''}`.trim()
				);
				console.error(`recording ${recording.id}: no adapter for track ${row.id}: ${problem}`);
				await db(env).update(t).set({ closedAt: now, error: problem }).where(eq(t.id, row.id));
			}
		}
	}
	return { tried: rows.length, ok };
}

/**
 * Marks tracks closed, then closes their adapters. The mark comes first, so a sink that flushes
 * as its socket closes is never refused. A close the SFU fails is logged and left: the adapter
 * ends with its participant's session anyway, and its sink refuses a reconnect once the track
 * is closed.
 */
async function closeTracks(env: Env, tracks: TrackRow[], now: number) {
	if (tracks.length === 0) return;
	const { callRecordingTracks: t } = schema;
	await db(env)
		.update(t)
		.set({ closedAt: now })
		.where(
			inArray(
				t.id,
				tracks.map((track) => track.id)
			)
		);
	const adapterIds = tracks.flatMap((track) => (track.adapterId ? [track.adapterId] : []));
	for (let i = 0; i < adapterIds.length; i += sfu.adapterBatch) {
		const batch = adapterIds.slice(i, i + sfu.adapterBatch);
		try {
			const { tracks: results } = await sfu.closeAdapters(env, batch);
			for (const failed of results.filter((r) => r.errorCode)) {
				console.error(`recording: closing adapter ${failed.adapterId} failed: ${failed.errorCode}`);
			}
		} catch (e) {
			console.error(
				`recording: closing adapters ${batch.join(', ')} failed: ${e instanceof Error ? e.message : e}`
			);
		}
	}
}
