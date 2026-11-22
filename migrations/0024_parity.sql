-- Notes parity. Adds only.

-- When a note last changed or was commented on, for the notes index's "Recent activity" sort.
-- The triggers keep it: an edit or rename moves updated_at, a comment brings its created_at.
ALTER TABLE notes ADD COLUMN last_activity_at INTEGER NOT NULL DEFAULT 0;
UPDATE notes SET last_activity_at = max(updated_at, coalesce((SELECT max(created_at) FROM note_comments WHERE note_id = notes.id), 0));

CREATE TRIGGER notes_activity_insert AFTER INSERT ON notes
WHEN new.last_activity_at < new.updated_at
BEGIN
	UPDATE notes SET last_activity_at = new.updated_at WHERE id = new.id;
END;

CREATE TRIGGER notes_activity_update AFTER UPDATE OF updated_at ON notes
WHEN new.updated_at > new.last_activity_at
BEGIN
	UPDATE notes SET last_activity_at = new.updated_at WHERE id = new.id;
END;

CREATE TRIGGER note_comments_activity AFTER INSERT ON note_comments
BEGIN
	UPDATE notes SET last_activity_at = max(last_activity_at, new.created_at) WHERE id = new.note_id;
END;

CREATE INDEX notes_by_activity ON notes (last_activity_at DESC, id DESC);
CREATE INDEX notes_by_created ON notes (created_at DESC, id DESC);

-- How each person lays out the notes index: rows or cards.
ALTER TABLE users ADD COLUMN note_layout TEXT NOT NULL DEFAULT 'list' CHECK (note_layout IN ('list', 'grid'));

-- Resolving note comments, and who hears about new ones.
ALTER TABLE note_comments ADD COLUMN resolved_at INTEGER;
ALTER TABLE note_comments ADD COLUMN resolved_by TEXT REFERENCES users (id) ON DELETE SET NULL;

CREATE TABLE note_subscriptions (
	note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (note_id, user_id)
);

INSERT OR IGNORE INTO note_subscriptions (note_id, user_id, created_at)
SELECT id, author_id, created_at FROM notes;
INSERT OR IGNORE INTO note_subscriptions (note_id, user_id, created_at)
SELECT note_id, author_id, min(created_at) FROM note_comments GROUP BY note_id, author_id;

-- Who has opened each note.
CREATE TABLE note_views (
	note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	viewed_at INTEGER NOT NULL,
	PRIMARY KEY (note_id, user_id)
);
CREATE INDEX note_views_recent ON note_views (note_id, viewed_at DESC);
ALTER TABLE notes ADD COLUMN anonymous_views INTEGER NOT NULL DEFAULT 0;

-- Notes published to the web.
ALTER TABLE notes ADD COLUMN public_token TEXT;
CREATE UNIQUE INDEX notes_public_token ON notes (public_token) WHERE public_token IS NOT NULL;

-- What happened to each note, for its timeline.
-- ref_id names a post or a note, so it has no foreign key; the triggers below delete a
-- reference with the post or note that made it.
CREATE TABLE note_events (
	id TEXT PRIMARY KEY,
	note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
	actor_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	kind TEXT NOT NULL CHECK (kind IN ('project', 'title', 'pinned', 'unpinned', 'referenced')),
	project_id TEXT REFERENCES projects (id) ON DELETE CASCADE,
	title TEXT,
	ref_type TEXT CHECK (ref_type IS NULL OR ref_type IN ('post', 'note')),
	ref_id TEXT,
	created_at INTEGER NOT NULL
);
CREATE INDEX note_events_note ON note_events (note_id, created_at);
CREATE UNIQUE INDEX note_events_reference ON note_events (note_id, ref_type, ref_id) WHERE kind = 'referenced';

CREATE TRIGGER posts_delete_note_events AFTER DELETE ON posts
BEGIN
	DELETE FROM note_events WHERE kind = 'referenced' AND ref_type = 'post' AND ref_id = old.id;
END;

CREATE TRIGGER notes_delete_note_references AFTER DELETE ON notes
BEGIN
	DELETE FROM note_events WHERE kind = 'referenced' AND ref_type = 'note' AND ref_id = old.id;
END;

-- Files uploaded into notes, and comments pinned to a point on one.
-- A note's files have their own table: a row in attachments belongs to a project or a thread.
CREATE TABLE note_attachments (
	id TEXT PRIMARY KEY,
	note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
	uploaded_by TEXT NOT NULL REFERENCES users (id),
	name TEXT NOT NULL,
	content_type TEXT NOT NULL,
	size INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);
CREATE INDEX note_attachments_note ON note_attachments (note_id);

-- x and y are fractions (0–1) of the image's width and height from its top-left corner.
-- Replies carry none of the three.
ALTER TABLE note_comments ADD COLUMN attachment_id TEXT REFERENCES note_attachments (id) ON DELETE CASCADE;
ALTER TABLE note_comments ADD COLUMN x REAL CHECK (x IS NULL OR (x BETWEEN 0 AND 1 AND attachment_id IS NOT NULL));
ALTER TABLE note_comments ADD COLUMN y REAL CHECK (y IS NULL OR (y BETWEEN 0 AND 1 AND x IS NOT NULL));

-- Which version of each note its thumbnail shows.
ALTER TABLE notes ADD COLUMN thumbnail_version INTEGER;
