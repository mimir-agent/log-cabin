-- A call shared into a channel after it started: the channel's members see it with this
-- permission, view or edit. Adds only; a call's own place, in calls, doesn't change.
CREATE TABLE call_shares (
	call_id TEXT PRIMARY KEY REFERENCES calls (id) ON DELETE CASCADE,
	project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
	permission TEXT NOT NULL CHECK (permission IN ('view', 'edit'))
);
CREATE INDEX call_shares_project ON call_shares (project_id);
