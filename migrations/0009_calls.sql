-- Calls: audio and video calls held in a project or a chat thread, with the media relayed
-- by Cloudflare's Realtime SFU. People are referenced by users.id, as in the posts module.

-- A call belongs to exactly one project or one thread. ended_at is null while it's live;
-- its duration is ended_at - started_at.
CREATE TABLE calls (
	id TEXT PRIMARY KEY,
	project_id TEXT REFERENCES projects (id) ON DELETE CASCADE,
	thread_id TEXT REFERENCES chat_threads (id) ON DELETE CASCADE,
	started_by TEXT NOT NULL REFERENCES users (id),
	started_at INTEGER NOT NULL,
	ended_at INTEGER,
	CHECK ((project_id IS NULL) != (thread_id IS NULL))
);
CREATE INDEX calls_project ON calls (project_id, started_at DESC);
CREATE INDEX calls_thread ON calls (thread_id, started_at DESC);
-- At most one live call per project or thread.
CREATE UNIQUE INDEX calls_live_project ON calls (project_id) WHERE ended_at IS NULL AND project_id IS NOT NULL;
CREATE UNIQUE INDEX calls_live_thread ON calls (thread_id) WHERE ended_at IS NULL AND thread_id IS NOT NULL;

-- One row per time someone joins: session_id is their SFU session, tracks a JSON array of
-- the track names they publish (audio, video, screen). left_at is null while they're in.
CREATE TABLE call_participants (
	id TEXT PRIMARY KEY,
	call_id TEXT NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	session_id TEXT NOT NULL,
	tracks TEXT NOT NULL DEFAULT '[]',
	muted INTEGER NOT NULL DEFAULT 0,
	camera_off INTEGER NOT NULL DEFAULT 0,
	joined_at INTEGER NOT NULL,
	left_at INTEGER
);
CREATE INDEX call_participants_call ON call_participants (call_id);
