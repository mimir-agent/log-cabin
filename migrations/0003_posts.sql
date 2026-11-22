-- Projects, posts, comments, reactions and attachments.
-- People are referenced by users.id throughout; a user's role comes from members.

-- A space for posts. Public projects are visible to every admin, member and viewer;
-- private projects, and every project for a guest, need a project_members row.
CREATE TABLE projects (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	private INTEGER NOT NULL DEFAULT 0 CHECK (private IN (0, 1)),
	archived_at INTEGER,
	created_by TEXT NOT NULL REFERENCES users (id),
	created_at INTEGER NOT NULL
);

CREATE TABLE project_members (
	project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user_id ON project_members (user_id);

CREATE TABLE project_favorites (
	project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (project_id, user_id)
);

-- body is sanitized ProseMirror JSON; body_text is its plain text, for search and previews.
-- last_activity_at moves on create and on every new comment, and orders the feeds.
CREATE TABLE posts (
	id TEXT PRIMARY KEY,
	project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
	author_id TEXT NOT NULL REFERENCES users (id),
	title TEXT NOT NULL,
	body TEXT NOT NULL,
	body_text TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	edited_at INTEGER,
	last_activity_at INTEGER NOT NULL,
	resolved_at INTEGER,
	resolved_by TEXT REFERENCES users (id),
	resolved_comment_id TEXT
);
CREATE INDEX posts_feed ON posts (last_activity_at DESC, id DESC);
CREATE INDEX posts_project_feed ON posts (project_id, last_activity_at DESC, id DESC);

-- parent_id is the top-level comment a reply answers; replies are one level deep.
CREATE TABLE comments (
	id TEXT PRIMARY KEY,
	post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
	parent_id TEXT REFERENCES comments (id) ON DELETE CASCADE,
	author_id TEXT NOT NULL REFERENCES users (id),
	body TEXT NOT NULL,
	body_text TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	edited_at INTEGER
);
CREATE INDEX comments_post_id ON comments (post_id, created_at);

-- subject_id is a post or comment id; subject_type says which.
CREATE TABLE reactions (
	id TEXT PRIMARY KEY,
	subject_type TEXT NOT NULL CHECK (subject_type IN ('post', 'comment')),
	subject_id TEXT NOT NULL,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	emoji TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	UNIQUE (subject_type, subject_id, user_id, emoji)
);
CREATE INDEX reactions_subject ON reactions (subject_type, subject_id);

-- Files in R2 under attachments/<id>. Anyone who can see project_id can fetch one.
CREATE TABLE attachments (
	id TEXT PRIMARY KEY,
	project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
	uploaded_by TEXT NOT NULL REFERENCES users (id),
	name TEXT NOT NULL,
	content_type TEXT NOT NULL,
	size INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);

-- Reactions have no foreign key to their subject, so deleting one removes its reactions here.
CREATE TRIGGER posts_delete_reactions AFTER DELETE ON posts BEGIN
	DELETE FROM reactions WHERE subject_type = 'post' AND subject_id = old.id;
END;
CREATE TRIGGER comments_delete_reactions AFTER DELETE ON comments BEGIN
	DELETE FROM reactions WHERE subject_type = 'comment' AND subject_id = old.id;
	UPDATE posts SET resolved_comment_id = NULL WHERE resolved_comment_id = old.id;
END;

-- search_index rows. visibility 'project' means: whoever can see project_id.
CREATE TRIGGER posts_search_insert AFTER INSERT ON posts BEGIN
	INSERT INTO search_index (kind, ref_id, project_id, visibility, owner_id, title, body)
	VALUES ('post', new.id, new.project_id, 'project', new.author_id, new.title, new.body_text);
END;
CREATE TRIGGER posts_search_update AFTER UPDATE OF title, body_text, project_id ON posts BEGIN
	UPDATE search_index SET title = new.title, body = new.body_text, project_id = new.project_id
	WHERE kind = 'post' AND ref_id = new.id;
END;
CREATE TRIGGER posts_search_delete AFTER DELETE ON posts BEGIN
	DELETE FROM search_index WHERE kind = 'post' AND ref_id = old.id;
END;

CREATE TRIGGER comments_search_insert AFTER INSERT ON comments BEGIN
	INSERT INTO search_index (kind, ref_id, project_id, visibility, owner_id, title, body)
	SELECT 'comment', new.id, project_id, 'project', new.author_id, '', new.body_text
	FROM posts WHERE id = new.post_id;
END;
CREATE TRIGGER comments_search_update AFTER UPDATE OF body_text ON comments BEGIN
	UPDATE search_index SET body = new.body_text WHERE kind = 'comment' AND ref_id = new.id;
END;
CREATE TRIGGER comments_search_delete AFTER DELETE ON comments BEGIN
	DELETE FROM search_index WHERE kind = 'comment' AND ref_id = old.id;
END;
