-- Posts, part three: feedback requests, reminders ("remind me"), link previews and comments
-- pinned to a point on an image.

-- A post's author asking someone for feedback. replied_at is set by their first comment on the
-- post after the request; dismissed_at when they decline it. Asking again after a dismissal
-- clears dismissed_at and moves created_at, which notifies them again.
CREATE TABLE post_feedback_requests (
	id TEXT PRIMARY KEY,
	post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	requested_by TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	replied_at INTEGER,
	dismissed_at INTEGER,
	UNIQUE (post_id, user_id)
);

CREATE TRIGGER comments_feedback_replied AFTER INSERT ON comments BEGIN
	UPDATE post_feedback_requests SET replied_at = new.created_at
	WHERE post_id = new.post_id AND user_id = new.author_id AND replied_at IS NULL;
END;

-- A reminder someone set for themselves about a post, a comment, a note or a call. The */5
-- cron puts it in their inbox once show_at has passed and sets shown_at; snoozing moves
-- show_at and clears shown_at; done deletes it. title and url are the subject's, as the
-- person saw it when setting the reminder. One reminder per person per subject.
CREATE TABLE follow_ups (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	subject_type TEXT NOT NULL CHECK (subject_type IN ('post', 'comment', 'note', 'call')),
	subject_id TEXT NOT NULL,
	title TEXT NOT NULL,
	url TEXT NOT NULL,
	show_at INTEGER NOT NULL,
	shown_at INTEGER,
	created_at INTEGER NOT NULL,
	UNIQUE (user_id, subject_type, subject_id)
);
CREATE INDEX follow_ups_due ON follow_ups (show_at) WHERE shown_at IS NULL;

-- subject_id has no foreign key, so a reminder goes when its subject does.
CREATE TRIGGER posts_delete_follow_ups AFTER DELETE ON posts BEGIN
	DELETE FROM follow_ups WHERE subject_type = 'post' AND subject_id = old.id;
END;
CREATE TRIGGER comments_delete_follow_ups AFTER DELETE ON comments BEGIN
	DELETE FROM follow_ups WHERE subject_type = 'comment' AND subject_id = old.id;
END;
CREATE TRIGGER notes_delete_follow_ups AFTER DELETE ON notes BEGIN
	DELETE FROM follow_ups WHERE subject_type = 'note' AND subject_id = old.id;
END;
CREATE TRIGGER calls_delete_follow_ups AFTER DELETE ON calls BEGIN
	DELETE FROM follow_ups WHERE subject_type = 'call' AND subject_id = old.id;
END;

-- Link previews fetched by the server, one row per URL, kept for 24 hours. preview is the
-- JSON the page shows, or NULL when the fetch failed or found nothing to show (the link
-- then stays a plain link until the row expires).
CREATE TABLE link_previews (
	url TEXT PRIMARY KEY,
	preview TEXT,
	fetched_at INTEGER NOT NULL
);

-- A comment pinned to a point on one of its post's images: x and y are fractions (0–1) of the
-- image's width and height from its top-left corner. Replies to it carry none of the three.
ALTER TABLE comments ADD COLUMN attachment_id TEXT REFERENCES attachments (id) ON DELETE CASCADE;
ALTER TABLE comments ADD COLUMN x REAL CHECK (x IS NULL OR (x BETWEEN 0 AND 1 AND attachment_id IS NOT NULL));
ALTER TABLE comments ADD COLUMN y REAL CHECK (y IS NULL OR (y BETWEEN 0 AND 1 AND x IS NOT NULL));

-- Notifications gain 'feedback' (someone asked for yours) and 'follow_up' (a reminder you set
-- came due). Same columns and rows as 0011.
CREATE TABLE notifications_next (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	actor_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	kind TEXT NOT NULL CHECK (kind IN ('mention', 'comment', 'reply', 'message', 'post', 'note', 'call', 'feedback', 'follow_up')),
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

-- As in 0011: a saved settings row lists only the kinds that existed when it was saved, which
-- would leave the new kinds unpushed without anyone choosing that.
UPDATE notification_settings
	SET push_kinds = json_insert(push_kinds, '$[#]', 'feedback')
	WHERE NOT EXISTS (SELECT 1 FROM json_each(push_kinds) WHERE value = 'feedback');
UPDATE notification_settings
	SET push_kinds = json_insert(push_kinds, '$[#]', 'follow_up')
	WHERE NOT EXISTS (SELECT 1 FROM json_each(push_kinds) WHERE value = 'follow_up');
