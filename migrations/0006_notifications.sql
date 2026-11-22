-- Notifications, the inbox, push subscriptions and each person's notification settings.

-- One row per thing a person is told about. item_key groups rows about the same item
-- ('post:<id>', 'thread:<id>', 'note:<id>') so the inbox shows each item once.
--   kind  'mention' | 'comment' | 'reply' | 'message' | 'post' | 'note'
--   url   where the inbox row links to
--   title the item's title when the event's module has one (a post's), else NULL
--   source  the event that caused it, e.g. 'comment.created:<id>'; unique per person, so a
--           retried event never notifies anyone twice
-- emailed_at is set when the unread sweeper has emailed it, so it is emailed once.
CREATE TABLE notifications (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	actor_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	kind TEXT NOT NULL CHECK (kind IN ('mention', 'comment', 'reply', 'message', 'post', 'note')),
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
CREATE INDEX notifications_user ON notifications (user_id, archived_at, read_at, created_at DESC);
CREATE INDEX notifications_unemailed ON notifications (created_at) WHERE read_at IS NULL AND emailed_at IS NULL;

-- A browser that accepted push for one person. Deleted when the push service answers 404 or 410.
CREATE TABLE push_subscriptions (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	endpoint TEXT NOT NULL UNIQUE,
	p256dh TEXT NOT NULL,
	auth TEXT NOT NULL,
	created_at INTEGER NOT NULL
);
CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);

-- A person's choices. No row means the defaults: every kind pushed, mentions and messages
-- emailed, a daily digest at 08:00 in users.timezone.
--   email_kinds, push_kinds  JSON arrays of notification kinds
--   digest                   'off' | 'daily' | 'weekly' (weekly goes out on digest_weekday, 0 = Sunday)
--   last_digest_at           when the last digest was considered, so an hour is never sent twice
CREATE TABLE notification_settings (
	user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
	email_kinds TEXT NOT NULL,
	push_kinds TEXT NOT NULL,
	digest TEXT NOT NULL CHECK (digest IN ('off', 'daily', 'weekly')),
	digest_hour INTEGER NOT NULL CHECK (digest_hour BETWEEN 0 AND 23),
	digest_weekday INTEGER NOT NULL CHECK (digest_weekday BETWEEN 0 AND 6),
	last_digest_at INTEGER
);
