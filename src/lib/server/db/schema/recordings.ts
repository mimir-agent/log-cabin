import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { users } from './core';
import { calls, callParticipants } from './calls';

// Mirrors migrations/0013_recordings.sql, which also holds the one-live-recording-per-call
// and one-open-track-per-person indexes and the CHECKs.

export const recordingStatuses = ['recording', 'processing', 'ready', 'failed'] as const;
export type RecordingStatus = (typeof recordingStatuses)[number];
export const videoStatuses = ['none', 'uploading', 'ready', 'failed'] as const;
export type VideoStatus = (typeof videoStatuses)[number];

export const callRecordings = sqliteTable('call_recordings', {
	id: text('id').primaryKey(),
	callId: text('call_id')
		.notNull()
		.references(() => calls.id, { onDelete: 'cascade' }),
	startedBy: text('started_by')
		.notNull()
		.references(() => users.id),
	/** 0044: the org's setting started it, not startedBy, who is then the call's starter. */
	auto: integer('auto', { mode: 'boolean' }).notNull().default(false),
	startedAt: integer('started_at').notNull(),
	stoppedAt: integer('stopped_at'),
	status: text('status', { enum: recordingStatuses }).notNull().default('recording'),
	videoStatus: text('video_status', { enum: videoStatuses }).notNull().default('none'),
	videoUploadId: text('video_upload_id'),
	failure: text('failure')
});

export const callRecordingTracks = sqliteTable('call_recording_tracks', {
	id: text('id').primaryKey(),
	recordingId: text('recording_id')
		.notNull()
		.references(() => callRecordings.id, { onDelete: 'cascade' }),
	participantId: text('participant_id')
		.notNull()
		.references(() => callParticipants.id, { onDelete: 'cascade' }),
	adapterId: text('adapter_id'),
	openedAt: integer('opened_at').notNull(),
	closedAt: integer('closed_at'),
	error: text('error')
});

export const segmentStatuses = ['pending', 'done', 'failed'] as const;

export const callRecordingSegments = sqliteTable('call_recording_segments', {
	id: text('id').primaryKey(),
	recordingId: text('recording_id')
		.notNull()
		.references(() => callRecordings.id, { onDelete: 'cascade' }),
	trackId: text('track_id')
		.notNull()
		.references(() => callRecordingTracks.id, { onDelete: 'cascade' }),
	seq: integer('seq').notNull(),
	r2Key: text('r2_key').notNull(),
	startMs: integer('start_ms').notNull(),
	durationMs: integer('duration_ms').notNull(),
	status: text('status', { enum: segmentStatuses }).notNull().default('pending'),
	createdAt: integer('created_at').notNull()
});

export const callTranscriptLines = sqliteTable('call_transcript_lines', {
	id: text('id').primaryKey(),
	recordingId: text('recording_id')
		.notNull()
		.references(() => callRecordings.id, { onDelete: 'cascade' }),
	segmentId: text('segment_id')
		.notNull()
		.references(() => callRecordingSegments.id, { onDelete: 'cascade' }),
	startMs: integer('start_ms').notNull(),
	endMs: integer('end_ms').notNull(),
	text: text('text').notNull(),
	/** What was heard, once `text` has been edited. */
	originalText: text('original_text')
});

export const callRecordingVideoParts = sqliteTable(
	'call_recording_video_parts',
	{
		recordingId: text('recording_id')
			.notNull()
			.references(() => callRecordings.id, { onDelete: 'cascade' }),
		partNumber: integer('part_number').notNull(),
		etag: text('etag').notNull()
	},
	(t) => [primaryKey({ columns: [t.recordingId, t.partNumber] })]
);
