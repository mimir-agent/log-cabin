-- Cal.com: bookings made on Cal.com get a call in this app. Cal.com sends each booking to a
-- webhook here, signed with a secret this app generated; the booking gets a join link, which is
-- written back onto the Cal.com booking with the API key an admin stored.

-- The connection, once an admin sets it up: one row. Calls from bookings start in project_id.
-- webhook_secret and api_key are encrypted (AES-GCM, key derived from SESSION_SECRET).
CREATE TABLE calcom_settings (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
	webhook_secret TEXT NOT NULL,
	api_key TEXT NOT NULL,
	updated_at INTEGER NOT NULL
);

-- One row per Cal.com booking. uid is Cal.com's booking uid; attendees is a JSON array of
-- { name, email }. cancelled_at is set when Cal.com reports the booking cancelled.
CREATE TABLE calcom_bookings (
	id TEXT PRIMARY KEY,
	uid TEXT NOT NULL UNIQUE,
	title TEXT NOT NULL,
	attendees TEXT NOT NULL DEFAULT '[]',
	starts_at INTEGER NOT NULL,
	ends_at INTEGER NOT NULL,
	cancelled_at INTEGER,
	created_at INTEGER NOT NULL
);

-- A call started from a booking's link carries the booking, so its record shows the
-- booking's title and attendees.
ALTER TABLE calls ADD COLUMN calcom_booking_id TEXT REFERENCES calcom_bookings (id) ON DELETE SET NULL;
