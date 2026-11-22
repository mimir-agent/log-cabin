-- Post comments resolve as note comments do (0024_parity.sql), and resolving a comment tells its
-- author: notifications gain the kind 'comment_resolved'.

-- A top-level comment's thread, resolved, and by whom. Null while open.
ALTER TABLE comments ADD COLUMN resolved_at INTEGER;
ALTER TABLE comments ADD COLUMN resolved_by TEXT REFERENCES users (id) ON DELETE SET NULL;

-- The kind is in a CHECK, so notifications is copied forward with it widened. Same columns and
-- rows as 0023_notify2.sql, plus held_at from 0030_reminder_push.sql; notification_settings is
-- left as it is.
CREATE TABLE notifications_next (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	actor_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	kind TEXT NOT NULL CHECK (kind IN ('mention', 'comment', 'reply', 'message', 'post', 'note', 'call', 'feedback', 'follow_up', 'join_request', 'reaction', 'added_to_project', 'project_renamed', 'project_archived', 'post_moved', 'comment_resolved')),
	item_key TEXT NOT NULL,
	url TEXT NOT NULL,
	title TEXT,
	source TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	read_at INTEGER,
	archived_at INTEGER,
	emailed_at INTEGER,
	held_at INTEGER,
	UNIQUE (user_id, source)
);
INSERT INTO notifications_next (id, user_id, actor_id, kind, item_key, url, title, source, created_at, read_at, archived_at, emailed_at, held_at)
	SELECT id, user_id, actor_id, kind, item_key, url, title, source, created_at, read_at, archived_at, emailed_at, held_at
	FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_next RENAME TO notifications;
CREATE INDEX notifications_user ON notifications (user_id, archived_at, read_at, created_at DESC);
CREATE INDEX notifications_unemailed ON notifications (created_at) WHERE read_at IS NULL AND emailed_at IS NULL;
