-- Polls, server-side drafts and post versions. Adds only.

-- One poll per post. Options keep their ids when the poll is edited, so their votes stay.
CREATE TABLE polls (
	post_id TEXT PRIMARY KEY REFERENCES posts (id) ON DELETE CASCADE,
	question TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL
);

CREATE TABLE poll_options (
	id TEXT PRIMARY KEY,
	post_id TEXT NOT NULL REFERENCES polls (post_id) ON DELETE CASCADE,
	position INTEGER NOT NULL,
	description TEXT NOT NULL
);
CREATE INDEX poll_options_post ON poll_options (post_id, position);

-- One vote per person per poll; voting again replaces it.
CREATE TABLE poll_votes (
	post_id TEXT NOT NULL REFERENCES polls (post_id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	option_id TEXT NOT NULL REFERENCES poll_options (id) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (post_id, user_id)
);
CREATE INDEX poll_votes_option ON poll_votes (option_id);

-- A post being written, seen only by its author. Publishing creates the post and deletes
-- the draft, so nothing that reads posts (feeds, search, notifications) ever sees one.
-- poll is the composer's poll as JSON ({"question", "options": [...]}) or NULL.
CREATE TABLE post_drafts (
	id TEXT PRIMARY KEY,
	author_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
	title TEXT NOT NULL DEFAULT '',
	body TEXT NOT NULL,
	poll TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE INDEX post_drafts_author ON post_drafts (author_id, updated_at DESC);

-- Versions: a new version is a new post whose parent_id is the version before it.
-- The feeds show only the latest version of each chain.
ALTER TABLE posts ADD COLUMN parent_id TEXT REFERENCES posts (id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
CREATE INDEX posts_parent ON posts (parent_id);

-- Deleting a version in the middle of a chain links the next one to the one before it.
CREATE TRIGGER posts_delete_relink_versions BEFORE DELETE ON posts BEGIN
	UPDATE posts SET parent_id = old.parent_id WHERE parent_id = old.id;
END;
