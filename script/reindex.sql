-- Rebuilds search_index from the tables it mirrors, with the same rows the triggers write.
-- Run by script/reindex. A module whose triggers add rows adds its INSERT here too.
DELETE FROM search_index;

INSERT INTO search_index (kind, ref_id, project_id, visibility, owner_id, title, body)
SELECT 'member', members.id, NULL, 'org', users.id, users.name, users.email
FROM members JOIN users ON users.id = members.user_id;

INSERT INTO search_index (kind, ref_id, project_id, visibility, owner_id, title, body)
SELECT 'post', id, project_id, 'project', author_id, title, body_text FROM posts;

INSERT INTO search_index (kind, ref_id, project_id, visibility, owner_id, title, body)
SELECT 'comment', comments.id, posts.project_id, 'project', comments.author_id, '', comments.body_text
FROM comments JOIN posts ON posts.id = comments.post_id;

INSERT INTO search_index (kind, ref_id, project_id, visibility, owner_id, title, body)
SELECT 'note', id, project_id, 'note', author_id, title, body_text FROM notes;

INSERT INTO search_index (kind, ref_id, project_id, visibility, owner_id, title, body)
SELECT 'message', id, NULL, 'thread', author_id, '', body_text FROM messages WHERE deleted_at IS NULL;

INSERT INTO search_index (kind, ref_id, project_id, visibility, owner_id, title, body)
SELECT 'project', id, id, 'project', created_by, name, description FROM projects;

INSERT INTO search_index (kind, ref_id, project_id, visibility, owner_id, title, body)
SELECT 'call', calls.id, calls.project_id, 'call', calls.started_by, coalesce(calls.title, ''),
	call_search_text.body
FROM calls JOIN call_search_text ON call_search_text.call_id = calls.id;
