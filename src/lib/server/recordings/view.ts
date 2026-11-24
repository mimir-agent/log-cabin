import { asc, desc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { SignedIn } from '../auth/session';
import type { CallPlace } from '../calls/places';
import { canRecord, recordingAvailable } from './recordings';
import { getOrg } from '../org';
import { canEditTranscript, transcriptLines, type CallSummary } from './transcripts';

/**
 * What the call page shows about recording: the one running (for everyone's banner), whether
 * this person may start or stop one, every recording of the call with its transcript, audio
 * segments and video, and the call's title and summary. Call it only for someone who can see
 * the call.
 */
export async function recordingsView(
	env: Env,
	who: SignedIn,
	call: {
		id: string;
		startedBy: string;
		endedAt: number | null;
		place: CallPlace;
		title: string | null;
		summary: string | null;
	}
) {
	const { callRecordings: r, callRecordingSegments: s, users } = schema;
	const rows = await db(env)
		.select({ recording: r, starterName: users.name })
		.from(r)
		.innerJoin(users, eq(users.id, r.startedBy))
		.where(eq(r.callId, call.id))
		.orderBy(desc(r.startedAt));
	/** Who started a recording; null for one the org's setting started. */
	const startedByName = ({ recording, starterName }: (typeof rows)[number]) =>
		recording.auto ? null : starterName;
	const recordings = await Promise.all(
		rows.map(async (row) => ({
			id: row.recording.id,
			status: row.recording.status,
			startedAt: row.recording.startedAt,
			startedByName: startedByName(row),
			video: row.recording.videoStatus === 'ready',
			segments: await db(env)
				.select({ id: s.id, startMs: s.startMs })
				.from(s)
				.where(eq(s.recordingId, row.recording.id))
				.orderBy(asc(s.startMs)),
			lines: await transcriptLines(env, row.recording.id)
		}))
	);
	const live = rows.find((row) => row.recording.status === 'recording');
	const callIsLive = call.endedAt === null;
	const { callRecording } = await getOrg(env);
	return {
		active: live
			? {
					id: live.recording.id,
					startedByName: startedByName(live),
					mine: live.recording.startedBy === who.user.id
				}
			: null,
		/** The org's setting: Off hides the record control, On leaves nothing to start or stop. */
		mode: callRecording,
		canRecord: callIsLive && recordingAvailable(env) && (await canRecord(env, who, call.place)),
		/** Whether this person, who started the call, is asked if it should be recorded. */
		prompt:
			callRecording === 'ask' && callIsLive && call.startedBy === who.user.id && rows.length === 0,
		canEditTranscript: await canEditTranscript(env, who, call),
		title: call.title,
		summary: call.summary ? (JSON.parse(call.summary) as CallSummary) : null,
		recordings: recordings.filter((recording) => recording.status !== 'recording')
	};
}

export type RecordingsView = Awaited<ReturnType<typeof recordingsView>>;
