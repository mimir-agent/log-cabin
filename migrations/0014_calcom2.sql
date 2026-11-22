-- Cal.com, part two: each member connects their own Cal.com account, with their own webhook,
-- and chooses where their bookings' calls happen. An admin can turn Cal.com off for everyone.
-- Outside attendees join a booking's call as guests, which needs the app to know when a
-- guest's browser is gone.

-- Admins turn Cal.com off for the whole organization here; members' connections are kept.
ALTER TABLE org ADD COLUMN calcom_enabled INTEGER NOT NULL DEFAULT 1;

-- One connection per member. webhook_id is the last segment of the member's webhook URL;
-- webhook_secret and api_key are encrypted as calcom_settings' were (AES-GCM, key derived
-- from SESSION_SECRET). Bookings' calls happen in project_id, or in the member's personal
-- room when it is null.
CREATE TABLE calcom_connections (
	user_id TEXT NOT NULL PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
	webhook_id TEXT NOT NULL UNIQUE,
	webhook_secret TEXT NOT NULL,
	api_key TEXT NOT NULL,
	project_id TEXT REFERENCES projects (id) ON DELETE CASCADE,
	updated_at INTEGER NOT NULL
);

-- Whose Cal.com account a booking came from. Every booking stored so far came through the
-- organization-wide connection, so they all become the first admin's below, as it does.
ALTER TABLE calcom_bookings ADD COLUMN owner_id TEXT REFERENCES users (id) ON DELETE CASCADE;

-- The first admin: the earliest admin who is still active. If there is a connection and no
-- such admin, user_id is null and the insert fails, leaving the migration unapplied.
INSERT INTO calcom_connections (user_id, webhook_id, webhook_secret, api_key, project_id, updated_at)
	SELECT
		(SELECT user_id FROM members WHERE role = 'admin' AND deactivated_at IS NULL ORDER BY created_at, id LIMIT 1),
		lower(hex(randomblob(16))), webhook_secret, api_key, project_id, updated_at
	FROM calcom_settings;
UPDATE calcom_bookings SET owner_id =
	(SELECT user_id FROM members WHERE role = 'admin' AND deactivated_at IS NULL ORDER BY created_at, id LIMIT 1);
DROP TABLE calcom_settings;

-- When a guest's browser last asked the server anything about the call. Guests have no
-- realtime socket, so this is how the app tells that a guest's browser has gone.
ALTER TABLE call_participants ADD COLUMN seen_at INTEGER;
