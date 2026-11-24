-- How the org records calls, and which recordings no one started by hand. Adds only.

-- off: no recording and no record control. ask: the person who starts a call is asked.
-- on: every call records from its start.
ALTER TABLE org ADD COLUMN call_recording TEXT NOT NULL DEFAULT 'ask'
  CHECK (call_recording IN ('off', 'ask', 'on'));

-- A recording the org's setting started. started_by holds the call's starter, so it stays
-- not null; the page says it started automatically.
ALTER TABLE call_recordings ADD COLUMN auto INTEGER NOT NULL DEFAULT 0 CHECK (auto IN (0, 1));
