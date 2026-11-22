-- Call recordings: each person's audio, as minute-long WAV segments in R2, transcribed line by
-- line; the composite video the recording browser uploads; and the call's title and summary,
-- written from the transcripts of all its recordings once the call has ended.

-- summary is JSON: the summary sections, each a grounded summary of the transcript.
ALTER TABLE calls ADD COLUMN title TEXT;
ALTER TABLE calls ADD COLUMN summary TEXT;

-- One recording of a call, from Record to Stop (or the call's end). A call has at most one
-- recording going at a time.
--   status        'recording' while it runs; 'processing' once stopped, until every segment is
--                 transcribed; then 'ready'. 'failed' when the hourly check finds it stuck.
--   video_status  'none' until the recording browser starts uploading, 'uploading', 'ready'
--                 once its multipart upload completes, or 'failed'.
CREATE TABLE call_recordings (
	id TEXT PRIMARY KEY,
	call_id TEXT NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
	started_by TEXT NOT NULL REFERENCES users (id),
	started_at INTEGER NOT NULL,
	stopped_at INTEGER,
	status TEXT NOT NULL DEFAULT 'recording'
		CHECK (status IN ('recording', 'processing', 'ready', 'failed')),
	video_status TEXT NOT NULL DEFAULT 'none'
		CHECK (video_status IN ('none', 'uploading', 'ready', 'failed')),
	video_upload_id TEXT,
	failure TEXT
);
CREATE INDEX call_recordings_call ON call_recordings (call_id, started_at);
CREATE UNIQUE INDEX call_recordings_live ON call_recordings (call_id) WHERE status = 'recording';

-- One person's microphone sent to the recording by an SFU WebSocket adapter. adapter_id is
-- null until the SFU answers; closed_at is set when the adapter is closed (the person left,
-- or the recording stopped), or with error when the SFU refused it.
CREATE TABLE call_recording_tracks (
	id TEXT PRIMARY KEY,
	recording_id TEXT NOT NULL REFERENCES call_recordings (id) ON DELETE CASCADE,
	participant_id TEXT NOT NULL REFERENCES call_participants (id) ON DELETE CASCADE,
	adapter_id TEXT,
	opened_at INTEGER NOT NULL,
	closed_at INTEGER,
	error TEXT
);
CREATE UNIQUE INDEX call_recording_tracks_open
	ON call_recording_tracks (recording_id, participant_id) WHERE closed_at IS NULL;

-- A minute (or less, at the end) of one track, stored in R2 at r2_key. start_ms counts from
-- the recording's start.
CREATE TABLE call_recording_segments (
	id TEXT PRIMARY KEY,
	recording_id TEXT NOT NULL REFERENCES call_recordings (id) ON DELETE CASCADE,
	track_id TEXT NOT NULL REFERENCES call_recording_tracks (id) ON DELETE CASCADE,
	seq INTEGER NOT NULL,
	r2_key TEXT NOT NULL,
	start_ms INTEGER NOT NULL,
	duration_ms INTEGER NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
	created_at INTEGER NOT NULL,
	UNIQUE (track_id, seq)
);
CREATE INDEX call_recording_segments_recording ON call_recording_segments (recording_id, status);

-- What speech recognition heard in a segment; the speaker is the segment's track's participant.
CREATE TABLE call_transcript_lines (
	id TEXT PRIMARY KEY,
	recording_id TEXT NOT NULL REFERENCES call_recordings (id) ON DELETE CASCADE,
	segment_id TEXT NOT NULL REFERENCES call_recording_segments (id) ON DELETE CASCADE,
	start_ms INTEGER NOT NULL,
	end_ms INTEGER NOT NULL,
	text TEXT NOT NULL
);
CREATE INDEX call_transcript_lines_recording ON call_transcript_lines (recording_id, start_ms);

-- The parts of the video's multipart upload, which completing it lists.
CREATE TABLE call_recording_video_parts (
	recording_id TEXT NOT NULL REFERENCES call_recordings (id) ON DELETE CASCADE,
	part_number INTEGER NOT NULL,
	etag TEXT NOT NULL,
	PRIMARY KEY (recording_id, part_number)
);
