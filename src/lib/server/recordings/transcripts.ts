import { error } from '@sveltejs/kit';
import type { SQLiteUpdateSetSource } from 'drizzle-orm/sqlite-core';
import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import type { SignedIn } from '../auth/session';
import { canSeePlace, type LoadedCall } from '../calls/calls';
import { canEditCall } from '../calls/shares';
import { newId } from '../id';
import { getOrg } from '../org';
import { publish } from '../realtime/publish';
import {
	groundedSummary,
	groundedTitle,
	type GroundedSummary,
	type SourceUnit
} from '../ai/grounded';
import { summariesOn } from '../ai/summaries';
import type { Handlers } from '../notifications/handlers';
import { calls as strings } from '../../strings/calls';
import { canRecord, flushGraceMs } from './recordings';

/** Workers AI speech recognition. Its model page lists no input limit; a segment's minute of 16 kHz WAV is about 2.6 MB as base64. */
export const TRANSCRIBE_MODEL = '@cf/openai/whisper-large-v3-turbo';

/** A transcript line as the summary reads it: its id and time ride along to link each bullet back. */
export type TranscriptUnit = SourceUnit & { lineId: string; startMs: number };

export const sectionKinds = ['summary', 'topics', 'nextSteps'] as const;
export type SectionKind = (typeof sectionKinds)[number];

/** What `calls.summary` holds. */
export type CallSummary = {
	sections: { kind: SectionKind; summary: GroundedSummary<TranscriptUnit> }[];
};

/** A call's summary section as one line of plain text for a list row; null when it has none. */
export function summaryPreview(summary: string | null): string | null {
	if (summary === null) return null;
	const { sections } = JSON.parse(summary) as CallSummary;
	const bullets = sections.find((section) => section.kind === 'summary')?.summary.bullets;
	return bullets?.length ? bullets.map((bullet) => bullet.text).join(' ') : null;
}

/** What each section asks for on top of the grounded summary's standing instructions. */
const sectionFocus: Record<SectionKind, string | undefined> = {
	summary: undefined,
	topics: 'Cover only the topics the call discussed, one bullet per topic.',
	nextSteps:
		'Cover only what someone said they or someone else will do after the call. If nobody said so, return no bullets.'
};

function base64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

/**
 * Transcribes one segment into timed lines. A segment already transcribed is left alone: the
 * queue retries the whole job when a later step fails.
 */
export async function transcribeSegment(env: Env, segmentId: string, now = Date.now()) {
	const { callRecordingSegments: s, callTranscriptLines: l } = schema;
	const segment = await db(env).select().from(s).where(eq(s.id, segmentId)).get();
	if (!segment) throw new Error(`transcribeSegment: no segment ${segmentId}`);
	if (segment.status !== 'pending') return;
	const object = await env.BUCKET.get(segment.r2Key);
	if (!object) throw new Error(`transcribeSegment: segment ${segmentId} has no R2 object`);
	const audio = base64(new Uint8Array(await object.arrayBuffer()));
	const result = await env.AI.run(TRANSCRIBE_MODEL, { audio });
	const heard = result.segments?.length
		? result.segments.map((part) => ({
				start: part.start ?? 0,
				end: part.end ?? 0,
				text: part.text ?? ''
			}))
		: [{ start: 0, end: segment.durationMs / 1000, text: result.text }];
	const lines = heard
		.map((part) => ({ ...part, text: part.text.trim() }))
		.filter((part) => part.text)
		.map((part) => ({
			id: newId(now),
			recordingId: segment.recordingId,
			segmentId,
			startMs: segment.startMs + Math.round(part.start * 1000),
			endMs: segment.startMs + Math.round(part.end * 1000),
			text: part.text
		}));
	const database = db(env);
	await database.batch([
		database.update(s).set({ status: 'done' }).where(eq(s.id, segmentId)),
		...lines.map((line) => database.insert(l).values(line))
	]);
}

/** A recording's transcript in time order, each line with who said it. */
export async function transcriptLines(env: Env, recordingId: string) {
	const { callTranscriptLines: l, callRecordingSegments: s, callRecordingTracks: t } = schema;
	const { callParticipants: p, users, callGuestPasses: guests } = schema;
	return db(env)
		.select({
			id: l.id,
			startMs: l.startMs,
			endMs: l.endMs,
			text: l.text,
			original: l.originalText,
			speaker: sql<string>`coalesce(${users.name}, ${guests.name})`
		})
		.from(l)
		.innerJoin(s, eq(s.id, l.segmentId))
		.innerJoin(t, eq(t.id, s.trackId))
		.innerJoin(p, eq(p.id, t.participantId))
		.leftJoin(users, eq(users.id, p.userId))
		.leftJoin(guests, eq(guests.id, p.guestPassId))
		.where(eq(l.recordingId, recordingId))
		.orderBy(asc(l.startMs), asc(l.id));
}

type EditableCall = Pick<LoadedCall, 'id' | 'startedBy' | 'place'>;

/**
 * Whether this person may fix the call's transcript: whoever may change the call, or post
 * where it is. Someone who can't see where it began (they reached it through a share) can't
 * post there.
 */
export async function canEditTranscript(env: Env, who: SignedIn, call: EditableCall) {
	if (await canEditCall(env, who, call)) return true;
	return (
		(await canSeePlace(env, who.user.id, who.member, call.place)) &&
		(await canRecord(env, who, call.place))
	);
}

/** Changes one of a call's transcript lines, keeping its times; 403 for anyone who may not. */
async function updateLine(
	env: Env,
	who: SignedIn,
	call: EditableCall,
	lineId: string,
	set: SQLiteUpdateSetSource<typeof schema.callTranscriptLines>
) {
	if (!(await canEditTranscript(env, who, call))) error(403, strings.recording.errors.cannotEdit);
	const { callTranscriptLines: l, callRecordings: r } = schema;
	const database = db(env);
	const updated = await database
		.update(l)
		.set(set)
		.where(
			and(
				eq(l.id, lineId),
				inArray(l.recordingId, database.select({ id: r.id }).from(r).where(eq(r.callId, call.id)))
			)
		)
		.returning({ id: l.id });
	if (updated.length === 0) error(404, strings.recording.errors.lineNotFound);
}

/** Fixes what a line says. The first fix keeps the words the model heard. */
export async function editTranscriptLine(
	env: Env,
	who: SignedIn,
	call: EditableCall,
	lineId: string,
	text: string
) {
	const fixed = text.trim();
	if (!fixed) error(400, strings.recording.errors.emptyLine);
	const l = schema.callTranscriptLines;
	await updateLine(env, who, call, lineId, {
		text: fixed,
		originalText: sql`coalesce(${l.originalText}, ${l.text})`
	});
}

/** Puts back what the model heard. A line that was never edited is left as it is. */
export async function revertTranscriptLine(
	env: Env,
	who: SignedIn,
	call: EditableCall,
	lineId: string
) {
	const l = schema.callTranscriptLines;
	await updateLine(env, who, call, lineId, {
		text: sql`coalesce(${l.originalText}, ${l.text})`,
		originalText: null
	});
}

/**
 * Marks a stopped recording ready once its sinks have had time to write their last segments
 * and every segment is transcribed. Runs after each transcription and once after the stop, so
 * whichever comes last finishes it.
 */
export async function finishIfTranscribed(env: Env, recordingId: string, now = Date.now()) {
	const { callRecordings: r, callRecordingSegments: s } = schema;
	const recording = await db(env).select().from(r).where(eq(r.id, recordingId)).get();
	if (recording?.status !== 'processing' || now < recording.stoppedAt! + flushGraceMs) return;
	const pending = await db(env)
		.select({ n: count() })
		.from(s)
		.where(and(eq(s.recordingId, recordingId), eq(s.status, 'pending')))
		.get();
	if (pending!.n > 0) return;
	await db(env)
		.update(r)
		.set({ status: 'ready' })
		.where(and(eq(r.id, recordingId), eq(r.status, 'processing')));
	await publish(env, `call:${recording.callId}`, { type: 'recording' });
}

/**
 * Writes a call's title and summary sections from the transcripts of all its recordings, once
 * the call has ended and none of them is still recording or processing, when the org has
 * summaries on. Runs when the call ends, after each recording job, and when the hourly check
 * fails a stuck recording, so whichever comes last writes it. `regenerate` writes it again
 * from the lines as they are now, after someone fixed some.
 */
export async function summarizeCallIfDone(env: Env, callId: string, regenerate = false) {
	const { calls, callRecordings: r } = schema;
	const call = await db(env).select().from(calls).where(eq(calls.id, callId)).get();
	if (!call) throw new Error(`summarizeCallIfDone: no call ${callId}`);
	if (call.endedAt === null || (call.summary !== null && !regenerate)) return;
	const unfinished = await db(env)
		.select({ n: count() })
		.from(r)
		.where(and(eq(r.callId, callId), inArray(r.status, ['recording', 'processing'])))
		.get();
	if (unfinished!.n > 0) return;
	const recordings = await db(env)
		.select({ id: r.id })
		.from(r)
		.where(eq(r.callId, callId))
		.orderBy(asc(r.startedAt));
	const lines = (await Promise.all(recordings.map((rec) => transcriptLines(env, rec.id)))).flat();
	if (lines.length === 0 || !summariesOn(env, await getOrg(env))) return;

	const units: TranscriptUnit[] = lines.map((line) => ({
		author: line.speaker,
		kind: strings.recording.at(line.startMs),
		text: line.text,
		lineId: line.id,
		startMs: line.startMs
	}));
	const sections = await Promise.all(
		sectionKinds.map(async (kind) => ({
			kind,
			summary: await groundedSummary(env, units, sectionFocus[kind])
		}))
	);
	const summary: CallSummary = { sections };
	const title = await groundedTitle(env, units);
	await db(env)
		.update(calls)
		.set({ title: title ?? call.title, summary: JSON.stringify(summary) })
		.where(regenerate ? eq(calls.id, callId) : and(eq(calls.id, callId), isNull(calls.summary)));
	await publish(env, `call:${callId}`, { type: 'recording' });
}

/** Writes the call's title and summary again from its edited transcript. */
export async function regenerateSummary(env: Env, who: SignedIn, call: EditableCall) {
	if (!(await canEditTranscript(env, who, call))) error(403, strings.recording.errors.cannotEdit);
	await summarizeCallIfDone(env, call.id, true);
}

export const recordingHandlers: Handlers = {
	async 'recording.segment'(env, event) {
		await transcribeSegment(env, event.segmentId);
		await finishIfTranscribed(env, event.recordingId);
		await summarizeCallIfDone(env, event.callId);
	},
	async 'recording.stopped'(env, event) {
		await finishIfTranscribed(env, event.recordingId);
		await summarizeCallIfDone(env, event.callId);
	},
	async 'call.ended'(env, event) {
		await summarizeCallIfDone(env, event.callId);
	}
};
