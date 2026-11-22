-- Tags, pins, bookmarks, moving posts, public post links and custom emoji. Adds only.

-- A post's tags are the #words in its body, kept in step on every save.
CREATE TABLE post_tags (
	post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
	tag TEXT NOT NULL,
	PRIMARY KEY (post_id, tag)
);
CREATE INDEX post_tags_tag ON post_tags (tag);

-- Posts, notes and calls pinned to the top of a project, in position order. subject_id has no
-- foreign key (it points at one of three tables); the triggers below remove a pin with its subject.
CREATE TABLE project_pins (
	id TEXT PRIMARY KEY,
	project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
	subject_type TEXT NOT NULL CHECK (subject_type IN ('post', 'note', 'call')),
	subject_id TEXT NOT NULL,
	pinned_by TEXT NOT NULL REFERENCES users (id),
	position INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	UNIQUE (project_id, subject_type, subject_id)
);
CREATE TRIGGER posts_delete_pins AFTER DELETE ON posts BEGIN
	DELETE FROM project_pins WHERE subject_type = 'post' AND subject_id = old.id;
END;
CREATE TRIGGER notes_delete_pins AFTER DELETE ON notes BEGIN
	DELETE FROM project_pins WHERE subject_type = 'note' AND subject_id = old.id;
END;
CREATE TRIGGER calls_delete_pins AFTER DELETE ON calls BEGIN
	DELETE FROM project_pins WHERE subject_type = 'call' AND subject_id = old.id;
END;

-- Links kept at the top of a project, in position order.
CREATE TABLE project_bookmarks (
	id TEXT PRIMARY KEY,
	project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	url TEXT NOT NULL,
	position INTEGER NOT NULL,
	created_by TEXT NOT NULL REFERENCES users (id),
	created_at INTEGER NOT NULL
);
CREATE INDEX project_bookmarks_project ON project_bookmarks (project_id, position);

-- The post's history line: who moved it, from where, to where.
CREATE TABLE post_moves (
	id TEXT PRIMARY KEY,
	post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
	moved_by TEXT NOT NULL REFERENCES users (id),
	from_project_id TEXT REFERENCES projects (id) ON DELETE SET NULL,
	to_project_id TEXT REFERENCES projects (id) ON DELETE SET NULL,
	created_at INTEGER NOT NULL
);
CREATE INDEX post_moves_post ON post_moves (post_id, created_at);

-- A moved post's comments follow it in search; 0003 already moves the post's own row.
CREATE TRIGGER posts_move_comment_search AFTER UPDATE OF project_id ON posts BEGIN
	UPDATE search_index SET project_id = new.project_id
	WHERE kind = 'comment' AND ref_id IN (SELECT id FROM comments WHERE post_id = new.id);
END;

-- A post is public while public_token is set; revoking clears it, so the old link is dead.
ALTER TABLE posts ADD COLUMN public_token TEXT;
CREATE UNIQUE INDEX posts_public_token ON posts (public_token) WHERE public_token IS NOT NULL;

ALTER TABLE org ADD COLUMN public_posts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE org ADD COLUMN public_posts_indexable INTEGER NOT NULL DEFAULT 0;
-- Who may add custom emoji: 'members' (members and admins) or 'admins'.
ALTER TABLE org ADD COLUMN custom_emoji_by TEXT NOT NULL DEFAULT 'members'
	CHECK (custom_emoji_by IN ('members', 'admins'));

-- The org's own emoji, used as :name: in reactions and text. The image is R2 emoji/<id>.
CREATE TABLE custom_emoji (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL UNIQUE,
	content_type TEXT NOT NULL,
	size INTEGER NOT NULL,
	created_by TEXT NOT NULL REFERENCES users (id),
	created_at INTEGER NOT NULL
);
