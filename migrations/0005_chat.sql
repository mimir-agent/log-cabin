-- Chat: direct messages and group threads, their messages, reactions and attachments.
-- People are referenced by users.id, as in the posts module.

-- dm_key is the two people's user ids, sorted and joined by ':', for a direct message;
-- it keeps one DM per pair. Group threads have a title and no dm_key.
CREATE TABLE chat_threads (
	id TEXT PRIMARY KEY,
	title TEXT,
	dm_key TEXT UNIQUE,
	created_by TEXT NOT NULL REFERENCES users (id),
	created_at INTEGER NOT NULL,
	last_message_at INTEGER NOT NULL,
	CHECK ((dm_key IS NULL) != (title IS NULL))
);
CREATE INDEX chat_threads_recent ON chat_threads (last_message_at DESC);

-- last_read_at: messages after it count as unread for this person.
CREATE TABLE chat_thread_members (
	thread_id TEXT NOT NULL REFERENCES chat_threads (id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	last_read_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (thread_id, user_id)
);
CREATE INDEX chat_thread_members_user_id ON chat_thread_members (user_id);

-- body is sanitized ProseMirror JSON; body_text its plain text. A deleted message keeps
-- its row, so replies to it still resolve, with the body emptied.
CREATE TABLE messages (
	id TEXT PRIMARY KEY,
	thread_id TEXT NOT NULL REFERENCES chat_threads (id) ON DELETE CASCADE,
	author_id TEXT NOT NULL REFERENCES users (id),
	reply_to_id TEXT REFERENCES messages (id),
	body TEXT NOT NULL,
	body_text TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	edited_at INTEGER,
	deleted_at INTEGER
);
CREATE INDEX messages_thread ON messages (thread_id, created_at);

CREATE TABLE message_reactions (
	message_id TEXT NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	emoji TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (message_id, user_id, emoji)
);

-- Attachments now belong to a project or to a chat thread, exactly one of them, so the
-- table is rebuilt with project_id nullable and a thread_id beside it. Nothing references it.
CREATE TABLE attachments_new (
	id TEXT PRIMARY KEY,
	project_id TEXT REFERENCES projects (id) ON DELETE CASCADE,
	thread_id TEXT REFERENCES chat_threads (id) ON DELETE CASCADE,
	uploaded_by TEXT NOT NULL REFERENCES users (id),
	name TEXT NOT NULL,
	content_type TEXT NOT NULL,
	size INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	CHECK ((project_id IS NULL) != (thread_id IS NULL))
);
INSERT INTO attachments_new (id, project_id, uploaded_by, name, content_type, size, created_at)
SELECT id, project_id, uploaded_by, name, content_type, size, created_at FROM attachments;
DROP TABLE attachments;
ALTER TABLE attachments_new RENAME TO attachments;

-- search_index rows. visibility 'thread' means: the members of the message's thread,
-- found through messages.thread_id by ref_id. Deleted messages leave the index.
CREATE TRIGGER messages_search_insert AFTER INSERT ON messages BEGIN
	INSERT INTO search_index (kind, ref_id, project_id, visibility, owner_id, title, body)
	VALUES ('message', new.id, NULL, 'thread', new.author_id, '', new.body_text);
END;
CREATE TRIGGER messages_search_update AFTER UPDATE OF body_text ON messages
WHEN new.deleted_at IS NULL BEGIN
	UPDATE search_index SET body = new.body_text WHERE kind = 'message' AND ref_id = new.id;
END;
CREATE TRIGGER messages_search_soft_delete AFTER UPDATE OF deleted_at ON messages
WHEN new.deleted_at IS NOT NULL BEGIN
	DELETE FROM search_index WHERE kind = 'message' AND ref_id = new.id;
END;
CREATE TRIGGER messages_search_delete AFTER DELETE ON messages BEGIN
	DELETE FROM search_index WHERE kind = 'message' AND ref_id = old.id;
END;
