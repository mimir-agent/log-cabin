-- AI summaries of posts, notes and chat threads.

-- An admin can turn summaries off for the whole organization.
ALTER TABLE org ADD COLUMN ai_enabled INTEGER NOT NULL DEFAULT 1;

-- One summary per post, note or chat thread. content_hash is the SHA-256 of the model and the exact
-- messages it read, so the summary is reused until what it read or the prompt changes.
CREATE TABLE ai_summaries (
	subject_type TEXT NOT NULL CHECK (subject_type IN ('post', 'note', 'thread')),
	subject_id TEXT NOT NULL,
	content_hash TEXT NOT NULL,
	summary TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (subject_type, subject_id)
);

-- subject_id has no foreign key, so summaries go with their post, note or thread here.
CREATE TRIGGER posts_delete_ai_summary AFTER DELETE ON posts BEGIN
	DELETE FROM ai_summaries WHERE subject_type = 'post' AND subject_id = old.id;
END;
CREATE TRIGGER notes_delete_ai_summary AFTER DELETE ON notes BEGIN
	DELETE FROM ai_summaries WHERE subject_type = 'note' AND subject_id = old.id;
END;
CREATE TRIGGER chat_threads_delete_ai_summary AFTER DELETE ON chat_threads BEGIN
	DELETE FROM ai_summaries WHERE subject_type = 'thread' AND subject_id = old.id;
END;
