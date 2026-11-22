-- Chat, part two: per-thread notification levels, marking a thread unread, group names and
-- pictures, membership changes in the timeline, chat channels, "Notify anyway", posts started
-- from a message, and favorite threads and notes. Adds only.

-- How much of a thread notifies this person: every message, only mentions of them and replies
-- to them, or nothing. Unread counts ignore it. marked_unread keeps a thread's badge, after
-- "Mark unread", until they open it again.
ALTER TABLE chat_thread_members ADD COLUMN notification_level TEXT NOT NULL DEFAULT 'all'
	CHECK (notification_level IN ('all', 'mentions', 'none'));
ALTER TABLE chat_thread_members ADD COLUMN marked_unread INTEGER NOT NULL DEFAULT 0;

-- A group with no name stores title '' (0005's CHECK needs a title on every group), and is
-- called by its members' names. image_key is the group's picture in the bucket.
-- project_id ties a chat channel to the project made with "Chat format": the thread is named
-- after the project and has exactly the project's members.
-- notification_forced_at: when the sender of a DM's latest message last used "Notify anyway".
ALTER TABLE chat_threads ADD COLUMN image_key TEXT;
ALTER TABLE chat_threads ADD COLUMN project_id TEXT REFERENCES projects (id) ON DELETE CASCADE;
ALTER TABLE chat_threads ADD COLUMN notification_forced_at INTEGER;
CREATE UNIQUE INDEX chat_threads_project ON chat_threads (project_id) WHERE project_id IS NOT NULL;

-- Who added or removed whom, shown in the thread's timeline. added and removed are JSON arrays
-- of user ids. Someone who removes only themselves left.
CREATE TABLE chat_membership_updates (
	id TEXT PRIMARY KEY,
	thread_id TEXT NOT NULL REFERENCES chat_threads (id) ON DELETE CASCADE,
	actor_id TEXT NOT NULL REFERENCES users (id),
	added TEXT NOT NULL DEFAULT '[]',
	removed TEXT NOT NULL DEFAULT '[]',
	created_at INTEGER NOT NULL
);
CREATE INDEX chat_membership_updates_thread ON chat_membership_updates (thread_id, created_at);

-- A post started from a chat message links back to it.
ALTER TABLE posts ADD COLUMN from_message_id TEXT REFERENCES messages (id) ON DELETE SET NULL;

-- A person's favorite notes and threads, in the sidebar beside their favorite projects.
CREATE TABLE favorites (
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	subject_type TEXT NOT NULL CHECK (subject_type IN ('note', 'thread')),
	subject_id TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (user_id, subject_type, subject_id)
);

-- A favorite goes with its subject, and a thread's with the person's place in it.
CREATE TRIGGER favorites_thread_left AFTER DELETE ON chat_thread_members BEGIN
	DELETE FROM favorites
	WHERE user_id = old.user_id AND subject_type = 'thread' AND subject_id = old.thread_id;
END;
CREATE TRIGGER favorites_thread_deleted AFTER DELETE ON chat_threads BEGIN
	DELETE FROM favorites WHERE subject_type = 'thread' AND subject_id = old.id;
END;
CREATE TRIGGER favorites_note_deleted AFTER DELETE ON notes BEGIN
	DELETE FROM favorites WHERE subject_type = 'note' AND subject_id = old.id;
END;

-- A chat channel has exactly its project's people.
CREATE TRIGGER chat_channel_joined AFTER INSERT ON project_members BEGIN
	INSERT OR IGNORE INTO chat_thread_members (thread_id, user_id, last_read_at, created_at)
	SELECT id, new.user_id, new.created_at, new.created_at FROM chat_threads
	WHERE project_id = new.project_id;
END;
CREATE TRIGGER chat_channel_left AFTER DELETE ON project_members BEGIN
	DELETE FROM chat_thread_members
	WHERE user_id = old.user_id
		AND thread_id IN (SELECT id FROM chat_threads WHERE project_id = old.project_id);
END;
