-- Search, part two: projects and calls join search_index, and the index's vocabulary becomes
-- readable, so search can correct a misspelt word against the words it holds. Adds only.

-- Projects by name and description. project_id is the project itself, so visibility 'project'
-- (whoever can see project_id) is the project's own rule: private ones only for their members.
INSERT INTO search_index (kind, ref_id, project_id, visibility, owner_id, title, body)
SELECT 'project', id, id, 'project', created_by, name, description FROM projects;

CREATE TRIGGER projects_search_insert AFTER INSERT ON projects BEGIN
	INSERT INTO search_index (kind, ref_id, project_id, visibility, owner_id, title, body)
	VALUES ('project', new.id, new.id, 'project', new.created_by, new.name, new.description);
END;
CREATE TRIGGER projects_search_update AFTER UPDATE OF name, description ON projects BEGIN
	UPDATE search_index SET title = new.name, body = new.description
	WHERE kind = 'project' AND ref_id = new.id;
END;
CREATE TRIGGER projects_search_delete AFTER DELETE ON projects BEGIN
	DELETE FROM search_index WHERE kind = 'project' AND ref_id = old.id;
END;

-- What a call is found by besides its title: the names of the people who were in it, then
-- the transcript of every recording, in the order it was said. One row per call.
CREATE VIEW call_search_text AS
SELECT calls.id AS call_id,
	coalesce((
		SELECT group_concat(name, ', ') FROM (
			SELECT DISTINCT coalesce(users.name, call_guest_passes.name) AS name
			FROM call_participants
			LEFT JOIN users ON users.id = call_participants.user_id
			LEFT JOIN call_guest_passes ON call_guest_passes.id = call_participants.guest_pass_id
			WHERE call_participants.call_id = calls.id
		)
	), '') || char(10) || coalesce((
		SELECT group_concat(text, char(10)) FROM (
			SELECT call_transcript_lines.text
			FROM call_transcript_lines
			JOIN call_recordings ON call_recordings.id = call_transcript_lines.recording_id
			WHERE call_recordings.call_id = calls.id
			ORDER BY call_recordings.started_at, call_transcript_lines.start_ms, call_transcript_lines.id
		)
	), '') AS body
FROM calls;

-- visibility 'call' means: whoever can see the call (calls/history.ts, visibleCalls).
INSERT INTO search_index (kind, ref_id, project_id, visibility, owner_id, title, body)
SELECT 'call', calls.id, calls.project_id, 'call', calls.started_by, coalesce(calls.title, ''),
	call_search_text.body
FROM calls JOIN call_search_text ON call_search_text.call_id = calls.id;

CREATE TRIGGER calls_search_insert AFTER INSERT ON calls BEGIN
	INSERT INTO search_index (kind, ref_id, project_id, visibility, owner_id, title, body)
	SELECT 'call', new.id, new.project_id, 'call', new.started_by, coalesce(new.title, ''), body
	FROM call_search_text WHERE call_id = new.id;
END;
CREATE TRIGGER calls_search_update AFTER UPDATE OF title ON calls BEGIN
	UPDATE search_index SET title = coalesce(new.title, '') WHERE kind = 'call' AND ref_id = new.id;
END;
CREATE TRIGGER calls_search_delete AFTER DELETE ON calls BEGIN
	DELETE FROM search_index WHERE kind = 'call' AND ref_id = old.id;
END;
CREATE TRIGGER call_participants_search_insert AFTER INSERT ON call_participants BEGIN
	UPDATE search_index SET body = (SELECT body FROM call_search_text WHERE call_id = new.call_id)
	WHERE kind = 'call' AND ref_id = new.call_id;
END;
CREATE TRIGGER call_transcript_lines_search_insert AFTER INSERT ON call_transcript_lines BEGIN
	UPDATE search_index SET body = (
		SELECT body FROM call_search_text
		WHERE call_id = (SELECT call_id FROM call_recordings WHERE id = new.recording_id)
	)
	WHERE kind = 'call' AND ref_id = (SELECT call_id FROM call_recordings WHERE id = new.recording_id);
END;
CREATE TRIGGER users_call_search_update AFTER UPDATE OF name ON users BEGIN
	UPDATE search_index SET body = (SELECT body FROM call_search_text WHERE call_id = search_index.ref_id)
	WHERE kind = 'call' AND ref_id IN (SELECT call_id FROM call_participants WHERE user_id = new.id);
END;

-- Every word in the index (stemmed, as the porter tokenizer stores it), once for each place a
-- row holds it, with that row's rowid as doc.
CREATE VIRTUAL TABLE search_vocab USING fts5vocab(search_index, 'instance');
