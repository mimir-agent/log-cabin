-- A note's timeline gains a line for the post that shared it. SQLite can't widen a CHECK, so
-- the table is rebuilt as 0023 did: same columns, rows copied, indexes recreated. The two
-- triggers that name it go first and come back after, as the rename checks every trigger.
DROP TRIGGER posts_delete_note_events;
DROP TRIGGER notes_delete_note_references;

CREATE TABLE note_events_next (
	id TEXT PRIMARY KEY,
	note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
	actor_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	kind TEXT NOT NULL CHECK (kind IN ('project', 'title', 'pinned', 'unpinned', 'referenced', 'posted')),
	project_id TEXT REFERENCES projects (id) ON DELETE CASCADE,
	title TEXT,
	ref_type TEXT CHECK (ref_type IS NULL OR ref_type IN ('post', 'note')),
	ref_id TEXT,
	created_at INTEGER NOT NULL
);
INSERT INTO note_events_next (id, note_id, actor_id, kind, project_id, title, ref_type, ref_id, created_at)
	SELECT id, note_id, actor_id, kind, project_id, title, ref_type, ref_id, created_at FROM note_events;
DROP TABLE note_events;
ALTER TABLE note_events_next RENAME TO note_events;
CREATE INDEX note_events_note ON note_events (note_id, created_at);
CREATE UNIQUE INDEX note_events_reference ON note_events (note_id, ref_type, ref_id) WHERE kind = 'referenced';

-- A deleted post takes its lines with it, as it did its reference.
CREATE TRIGGER posts_delete_note_events AFTER DELETE ON posts
BEGIN
	DELETE FROM note_events WHERE kind IN ('referenced', 'posted') AND ref_type = 'post' AND ref_id = old.id;
END;

CREATE TRIGGER notes_delete_note_references AFTER DELETE ON notes
BEGIN
	DELETE FROM note_events WHERE kind = 'referenced' AND ref_type = 'note' AND ref_id = old.id;
END;
