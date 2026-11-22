-- Invites II: starter projects on invites, how people with the org's email domain join, join
-- requests, and onboarding. Adds only.

-- What happens when someone whose address is at the org's email domain signs in without an
-- invite: 'off' refuses them, 'direct' makes them a member, 'request' asks the admins. Until
-- now a set domain meant joining directly, so an org with one keeps that.
ALTER TABLE org ADD COLUMN domain_join TEXT NOT NULL DEFAULT 'off'
	CHECK (domain_join IN ('off', 'direct', 'request'));
UPDATE org SET domain_join = 'direct' WHERE allowed_email_domain IS NOT NULL;

-- Projects that accepting an invite joins. An invite asked for from a link copies the link's.
CREATE TABLE invite_projects (
	invite_id TEXT NOT NULL REFERENCES invites (id) ON DELETE CASCADE,
	project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
	PRIMARY KEY (invite_id, project_id)
);

-- A pending request to join. The person has a users row and no members row while it waits:
-- approving adds the member and deletes the request, and denying deletes the users row, which
-- takes the request and the admins' notifications of it with it.
CREATE TABLE join_requests (
	user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
	created_at INTEGER NOT NULL
);
CREATE INDEX join_requests_created ON join_requests (created_at);

-- Onboarding after the first sign-in: the step to resume at, and when it was finished or
-- skipped. Everyone who is a member already has nothing to onboard.
ALTER TABLE members ADD COLUMN onboarding_step TEXT;
ALTER TABLE members ADD COLUMN onboarded_at INTEGER;
UPDATE members SET onboarded_at = created_at;

-- Notifications gain 'join_request', for admins. Same columns and rows as 0021.
CREATE TABLE notifications_next (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	actor_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	kind TEXT NOT NULL CHECK (kind IN ('mention', 'comment', 'reply', 'message', 'post', 'note', 'call', 'feedback', 'follow_up', 'join_request')),
	item_key TEXT NOT NULL,
	url TEXT NOT NULL,
	title TEXT,
	source TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	read_at INTEGER,
	archived_at INTEGER,
	emailed_at INTEGER,
	UNIQUE (user_id, source)
);
INSERT INTO notifications_next (id, user_id, actor_id, kind, item_key, url, title, source, created_at, read_at, archived_at, emailed_at)
	SELECT id, user_id, actor_id, kind, item_key, url, title, source, created_at, read_at, archived_at, emailed_at
	FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_next RENAME TO notifications;
CREATE INDEX notifications_user ON notifications (user_id, archived_at, read_at, created_at DESC);
CREATE INDEX notifications_unemailed ON notifications (created_at) WHERE read_at IS NULL AND emailed_at IS NULL;

-- As in 0011: a saved settings row lists only the kinds that existed when it was saved.
UPDATE notification_settings
	SET push_kinds = json_insert(push_kinds, '$[#]', 'join_request')
	WHERE NOT EXISTS (SELECT 1 FROM json_each(push_kinds) WHERE value = 'join_request');
