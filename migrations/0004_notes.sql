-- Notes: long-form documents, private to their author until shared.
-- People are referenced by users.id, as in 0003.

-- A note is shared with a project when project_id is set and project_permission isn't 'none':
-- then whoever can see the project may view it, or edit it with 'edit'.
-- version goes up by one on every save; a save names the version it started from and is
-- refused when that is no longer current.
CREATE TABLE notes (
	id TEXT PRIMARY KEY,
	author_id TEXT NOT NULL REFERENCES users (id),
	title TEXT NOT NULL,
	body TEXT NOT NULL,
	body_text TEXT NOT NULL,
	project_id TEXT REFERENCES projects (id),
	project_permission TEXT NOT NULL DEFAULT 'none'
		CHECK (project_permission IN ('none', 'view', 'edit')),
	version INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	updated_by TEXT NOT NULL REFERENCES users (id),
	CHECK (project_id IS NOT NULL OR project_permission = 'none')
);
CREATE INDEX notes_author ON notes (author_id, updated_at DESC);
CREATE INDEX notes_project ON notes (project_id, updated_at DESC);

-- A note shared with one person.
CREATE TABLE note_shares (
	note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	permission TEXT NOT NULL CHECK (permission IN ('view', 'edit')),
	created_at INTEGER NOT NULL,
	PRIMARY KEY (note_id, user_id)
);
CREATE INDEX note_shares_user_id ON note_shares (user_id);

-- Same shape as comments in 0003: parent_id is the top-level comment a reply answers.
CREATE TABLE note_comments (
	id TEXT PRIMARY KEY,
	note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
	parent_id TEXT REFERENCES note_comments (id) ON DELETE CASCADE,
	author_id TEXT NOT NULL REFERENCES users (id),
	body TEXT NOT NULL,
	body_text TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	edited_at INTEGER
);
CREATE INDEX note_comments_note_id ON note_comments (note_id, created_at);

-- subject_id is a note or note comment id; subject_type says which.
CREATE TABLE note_reactions (
	id TEXT PRIMARY KEY,
	subject_type TEXT NOT NULL CHECK (subject_type IN ('note', 'comment')),
	subject_id TEXT NOT NULL,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	emoji TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	UNIQUE (subject_type, subject_id, user_id, emoji)
);
CREATE INDEX note_reactions_subject ON note_reactions (subject_type, subject_id);

CREATE TRIGGER notes_delete_reactions AFTER DELETE ON notes BEGIN
	DELETE FROM note_reactions WHERE subject_type = 'note' AND subject_id = old.id;
END;
CREATE TRIGGER note_comments_delete_reactions AFTER DELETE ON note_comments BEGIN
	DELETE FROM note_reactions WHERE subject_type = 'comment' AND subject_id = old.id;
END;

-- search_index rows. visibility 'note' means: whoever can see note ref_id, by the note's
-- author, its note_shares rows and its project share.
CREATE TRIGGER notes_search_insert AFTER INSERT ON notes BEGIN
	INSERT INTO search_index (kind, ref_id, project_id, visibility, owner_id, title, body)
	VALUES ('note', new.id, new.project_id, 'note', new.author_id, new.title, new.body_text);
END;
CREATE TRIGGER notes_search_update AFTER UPDATE OF title, body_text, project_id ON notes BEGIN
	UPDATE search_index SET title = new.title, body = new.body_text, project_id = new.project_id
	WHERE kind = 'note' AND ref_id = new.id;
END;
CREATE TRIGGER notes_search_delete AFTER DELETE ON notes BEGIN
	DELETE FROM search_index WHERE kind = 'note' AND ref_id = old.id;
END;
