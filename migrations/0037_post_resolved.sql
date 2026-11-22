-- Resolving a post can come with a written resolution, and tells the people following it:
-- posts gain the resolution (a document, as body is), and notifications the kinds
-- 'post_resolved' and 'post_resolved_from_comment'.

ALTER TABLE posts ADD COLUMN resolved_body TEXT;

-- The kind is in a CHECK, so notifications is copied forward with it widened. Same columns and
-- rows as 0036_notification_summary.sql, summary and emoji too; notification_settings is left as it is.
CREATE TABLE notifications_next (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	actor_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	kind TEXT NOT NULL CHECK (kind IN ('mention', 'comment', 'reply', 'message', 'post', 'note', 'call', 'feedback', 'follow_up', 'join_request', 'reaction', 'added_to_project', 'project_renamed', 'project_archived', 'post_moved', 'comment_resolved', 'post_resolved', 'post_resolved_from_comment')),
	item_key TEXT NOT NULL,
	url TEXT NOT NULL,
	title TEXT,
	source TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	read_at INTEGER,
	archived_at INTEGER,
	emailed_at INTEGER,
	held_at INTEGER,
	summary TEXT,
	emoji TEXT,
	UNIQUE (user_id, source)
);
INSERT INTO notifications_next (id, user_id, actor_id, kind, item_key, url, title, source, created_at, read_at, archived_at, emailed_at, held_at, summary, emoji)
	SELECT id, user_id, actor_id, kind, item_key, url, title, source, created_at, read_at, archived_at, emailed_at, held_at, summary, emoji
	FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_next RENAME TO notifications;
CREATE INDEX notifications_user ON notifications (user_id, archived_at, read_at, created_at DESC);
CREATE INDEX notifications_unemailed ON notifications (created_at) WHERE read_at IS NULL AND emailed_at IS NULL;
