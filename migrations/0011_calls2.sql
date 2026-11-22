-- Calls, part two: personal rooms, invitations that ring, guest passes, and missed calls in
-- the inbox.
--
-- Two CHECK constraints from earlier migrations stand in the way, and SQLite can't alter a
-- CHECK: calls must belong to a project or a thread, and notifications.kind lists its six
-- kinds. So calls, call_participants and notifications are copied forward into new tables
-- with the same rows. Order matters: call_participants cascades on a deleted call, and
-- dropping a table deletes its rows first, so the participants are moved aside and their
-- table dropped before calls is.

-- Participants, set aside with their rows and no constraints.
CREATE TABLE call_participants_0009 AS SELECT * FROM call_participants;
DROP TABLE call_participants;

-- A call belongs to exactly one place: a project, a chat thread, or a member's personal
-- room (room_owner_id, the owner's users.id). The room is permanent; each call in it ends.
CREATE TABLE calls_next (
	id TEXT PRIMARY KEY,
	project_id TEXT REFERENCES projects (id) ON DELETE CASCADE,
	thread_id TEXT REFERENCES chat_threads (id) ON DELETE CASCADE,
	room_owner_id TEXT REFERENCES users (id) ON DELETE CASCADE,
	started_by TEXT NOT NULL REFERENCES users (id),
	started_at INTEGER NOT NULL,
	ended_at INTEGER,
	calcom_booking_id TEXT REFERENCES calcom_bookings (id) ON DELETE SET NULL,
	CHECK ((project_id IS NOT NULL) + (thread_id IS NOT NULL) + (room_owner_id IS NOT NULL) = 1)
);
INSERT INTO calls_next (id, project_id, thread_id, started_by, started_at, ended_at, calcom_booking_id)
	SELECT id, project_id, thread_id, started_by, started_at, ended_at, calcom_booking_id FROM calls;
DROP TABLE calls;
ALTER TABLE calls_next RENAME TO calls;
CREATE INDEX calls_project ON calls (project_id, started_at DESC);
CREATE INDEX calls_thread ON calls (thread_id, started_at DESC);
CREATE INDEX calls_room ON calls (room_owner_id, started_at DESC);
-- At most one live call per project, thread or room.
CREATE UNIQUE INDEX calls_live_project ON calls (project_id) WHERE ended_at IS NULL AND project_id IS NOT NULL;
CREATE UNIQUE INDEX calls_live_thread ON calls (thread_id) WHERE ended_at IS NULL AND thread_id IS NOT NULL;
CREATE UNIQUE INDEX calls_live_room ON calls (room_owner_id) WHERE ended_at IS NULL AND room_owner_id IS NOT NULL;

-- A pass that lets one person without an account join one call, with camera and microphone
-- only, between not_before and expires_at. The token itself is never stored, only its hash.
CREATE TABLE call_guest_passes (
	id TEXT PRIMARY KEY,
	call_id TEXT NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	token_hash TEXT NOT NULL UNIQUE,
	not_before INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	created_by TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	CHECK (not_before < expires_at)
);

-- One row per time someone joins: a member (user_id) or a guest on a pass (guest_pass_id),
-- never both. session_id is their SFU session, tracks a JSON array of the track names they
-- publish (audio, video, screen). left_at is null while they're in.
CREATE TABLE call_participants (
	id TEXT PRIMARY KEY,
	call_id TEXT NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
	user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
	guest_pass_id TEXT REFERENCES call_guest_passes (id) ON DELETE CASCADE,
	session_id TEXT NOT NULL,
	tracks TEXT NOT NULL DEFAULT '[]',
	muted INTEGER NOT NULL DEFAULT 0,
	camera_off INTEGER NOT NULL DEFAULT 0,
	joined_at INTEGER NOT NULL,
	left_at INTEGER,
	CHECK ((user_id IS NULL) != (guest_pass_id IS NULL))
);
INSERT INTO call_participants (id, call_id, user_id, session_id, tracks, muted, camera_off, joined_at, left_at)
	SELECT id, call_id, user_id, session_id, tracks, muted, camera_off, joined_at, left_at
	FROM call_participants_0009;
DROP TABLE call_participants_0009;
CREATE INDEX call_participants_call ON call_participants (call_id);
CREATE INDEX call_participants_user ON call_participants (user_id, call_id);

-- Someone in a live call asking another member to join it. Their open tabs ring until they
-- answer, the call ends, or 30 seconds pass.
--   status  'ringing' until it's 'accepted', 'declined', 'missed' (no answer in time) or
--           'cancelled' (the call ended first)
CREATE TABLE call_invitations (
	id TEXT PRIMARY KEY,
	call_id TEXT NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
	inviter_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	invitee_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	status TEXT NOT NULL DEFAULT 'ringing'
		CHECK (status IN ('ringing', 'accepted', 'declined', 'missed', 'cancelled')),
	created_at INTEGER NOT NULL,
	answered_at INTEGER
);
CREATE INDEX call_invitations_call ON call_invitations (call_id, created_at);
CREATE INDEX call_invitations_invitee ON call_invitations (invitee_id, status);
-- A person rings once at a time per call.
CREATE UNIQUE INDEX call_invitations_ringing ON call_invitations (call_id, invitee_id) WHERE status = 'ringing';

-- Notifications gain the kind 'call', for a missed call. Same columns and rows as 0006.
CREATE TABLE notifications_next (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	actor_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	kind TEXT NOT NULL CHECK (kind IN ('mention', 'comment', 'reply', 'message', 'post', 'note', 'call')),
	item_key TEXT NOT NULL,
	url TEXT NOT NULL,
	title TEXT,
	source TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	read_at INTEGER,
	archived_at INTEGER,
	emailed_at INTEGER,
	UNIQUE (user_id, source)
);
INSERT INTO notifications_next (id, user_id, actor_id, kind, item_key, url, title, source, created_at, read_at, archived_at, emailed_at)
	SELECT id, user_id, actor_id, kind, item_key, url, title, source, created_at, read_at, archived_at, emailed_at
	FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_next RENAME TO notifications;
CREATE INDEX notifications_user ON notifications (user_id, archived_at, read_at, created_at DESC);
CREATE INDEX notifications_unemailed ON notifications (created_at) WHERE read_at IS NULL AND emailed_at IS NULL;

-- No settings row means every kind is pushed, 'call' included. A row saved before this
-- migration lists only the kinds that existed then, which would leave its owner's ring and
-- missed-call pushes off without their choosing it. Email keeps its own list: its default
-- was never every kind.
UPDATE notification_settings
	SET push_kinds = json_insert(push_kinds, '$[#]', 'call')
	WHERE NOT EXISTS (SELECT 1 FROM json_each(push_kinds) WHERE value = 'call');
