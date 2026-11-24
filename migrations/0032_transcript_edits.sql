-- A fixed transcript line keeps what was heard here; `text` holds what is shown. Null: never edited.
ALTER TABLE call_transcript_lines ADD COLUMN original_text TEXT;

-- The call's search text reads the lines' text, so an edit refreshes it as an insert does.
CREATE TRIGGER call_transcript_lines_search_update AFTER UPDATE OF text ON call_transcript_lines BEGIN
	UPDATE search_index SET body = (
		SELECT body FROM call_search_text
		WHERE call_id = (SELECT call_id FROM call_recordings WHERE id = new.recording_id)
	)
	WHERE kind = 'call' AND ref_id = (SELECT call_id FROM call_recordings WHERE id = new.recording_id);
END;
