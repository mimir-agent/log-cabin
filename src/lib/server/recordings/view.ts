import { asc, desc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { SignedIn } from '../auth/session';
import type { CallPlace } from '../calls/places';
import { canRecord, recordingAvailable } from './recordings';
import { transcriptLines, type CallSummary } from './transcripts';

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
		endedAt: number | null;
		place: CallPlace;
		title: string | null;
		summary: string | null;
	}
) {
	const { callRecordings: r, callRecordingSegments: s, users } = schema;
	const rows = await db(env)
		.select({ recording: r, startedByName: users.name })
		.from(r)
		.innerJoin(users, eq(users.id, r.startedBy))
		.where(eq(r.callId, call.id))
		.orderBy(desc(r.startedAt));
	const recordings = await Promise.all(
		rows.map(async ({ recording }) => ({
			id: recording.id,
			status: recording.status,
			startedAt: recording.startedAt,
			video: recording.videoStatus === 'ready',
			segments: await db(env)
				.select({ id: s.id, startMs: s.startMs })
				.from(s)
				.where(eq(s.recordingId, recording.id))
				.orderBy(asc(s.startMs)),
			lines: await transcriptLines(env, recording.id)
		}))
	);
	const live = rows.find((row) => row.recording.status === 'recording');
	const callIsLive = call.endedAt === null;
	return {
		active: live
			? {
					id: live.recording.id,
					startedByName: live.startedByName,
					mine: live.recording.startedBy === who.user.id
				}
			: null,
		canRecord: callIsLive && recordingAvailable(env) && (await canRecord(env, who, call.place)),
		title: call.title,
		summary: call.summary ? (JSON.parse(call.summary) as CallSummary) : null,
		recordings: recordings.filter((recording) => recording.status !== 'recording')
	};
}

export type RecordingsView = Awaited<ReturnType<typeof recordingsView>>;
