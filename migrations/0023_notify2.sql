-- Notifications II: reaction and project notifications, post subscriptions, quiet hours and
-- org-activity digests.
-- Adds only; notifications and notification_settings are copied forward. Its name sorts after
-- 0023_invites2.sql, whose copy of notifications this one copies again.

-- Notifications gain 'reaction' (someone reacted to what you wrote), 'added_to_project',
-- 'project_renamed', 'project_archived' and 'post_moved' (a post moved into a project you
-- follow). Same columns and rows as 0023_invites2.sql.
CREATE TABLE notifications_next (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	actor_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	kind TEXT NOT NULL CHECK (kind IN ('mention', 'comment', 'reply', 'message', 'post', 'note', 'call', 'feedback', 'follow_up', 'join_request', 'reaction', 'added_to_project', 'project_renamed', 'project_archived', 'post_moved')),
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
UPDATE notification_settings SET push_kinds = (
	SELECT json_group_array(value) FROM (
		SELECT value FROM json_each(push_kinds)
		UNION
		SELECT value FROM json_each('["reaction", "added_to_project", "project_renamed", "project_archived", "post_moved"]')
	)
);

-- Who hears about new comments on a post. Its author and everyone who comments are subscribed
-- (the triggers), a new version keeps its parent's subscribers, and anyone can unsubscribe.
CREATE TABLE post_subscriptions (
	post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (post_id, user_id)
);
CREATE INDEX post_subscriptions_user ON post_subscriptions (user_id);
INSERT OR IGNORE INTO post_subscriptions (post_id, user_id, created_at)
	SELECT id, author_id, created_at FROM posts;
INSERT OR IGNORE INTO post_subscriptions (post_id, user_id, created_at)
	SELECT post_id, author_id, min(created_at) FROM comments GROUP BY post_id, author_id;

CREATE TRIGGER posts_subscribe_author AFTER INSERT ON posts BEGIN
	INSERT OR IGNORE INTO post_subscriptions (post_id, user_id, created_at)
		VALUES (NEW.id, NEW.author_id, NEW.created_at);
	INSERT OR IGNORE INTO post_subscriptions (post_id, user_id, created_at)
		SELECT NEW.id, user_id, NEW.created_at FROM post_subscriptions WHERE post_id = NEW.parent_id;
END;

CREATE TRIGGER comments_subscribe_author AFTER INSERT ON comments BEGIN
	INSERT OR IGNORE INTO post_subscriptions (post_id, user_id, created_at)
		VALUES (NEW.post_id, NEW.author_id, NEW.created_at);
END;

-- Quiet hours, Campsite's notification schedule: the hours someone gets push and email, on the
-- weekdays listed (0 = Sunday), in their time zone. Outside them nothing is pushed or emailed;
-- the inbox still gets everything, and what arrives then is never emailed later (its row is
-- stored with emailed_at set), as in Campsite. No row: notifications at all times.
CREATE TABLE notification_schedules (
	user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
	weekdays TEXT NOT NULL,
	start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
	end_minute INTEGER NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
	CHECK (start_minute < end_minute)
);

-- "Pause notifications until": no push or email before this time.
ALTER TABLE users ADD COLUMN notifications_paused_until INTEGER;

-- Settings: the single digest choice (off, daily or weekly, of unread notifications) becomes two
-- org-activity digests, each on or off at its own hour, as in Campsite: daily at 9:00 and weekly
-- on Friday at 17:00, both on. A saved choice carries over: 'daily' keeps the daily digest at its
-- hour, 'weekly' keeps the weekly one at its day and hour, 'off' turns both off.
CREATE TABLE notification_settings_next (
	user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
	email_kinds TEXT NOT NULL,
	push_kinds TEXT NOT NULL,
	daily_digest INTEGER NOT NULL CHECK (daily_digest IN (0, 1)),
	daily_digest_hour INTEGER NOT NULL CHECK (daily_digest_hour BETWEEN 0 AND 23),
	weekly_digest INTEGER NOT NULL CHECK (weekly_digest IN (0, 1)),
	weekly_digest_weekday INTEGER NOT NULL CHECK (weekly_digest_weekday BETWEEN 0 AND 6),
	weekly_digest_hour INTEGER NOT NULL CHECK (weekly_digest_hour BETWEEN 0 AND 23),
	last_daily_digest_at INTEGER,
	last_weekly_digest_at INTEGER
);
INSERT INTO notification_settings_next
	SELECT user_id, email_kinds, push_kinds,
		digest = 'daily', CASE WHEN digest = 'daily' THEN digest_hour ELSE 9 END,
		digest = 'weekly',
		CASE WHEN digest = 'weekly' THEN digest_weekday ELSE 5 END,
		CASE WHEN digest = 'weekly' THEN digest_hour ELSE 17 END,
		NULL, NULL
	FROM notification_settings;
DROP TABLE notification_settings;
ALTER TABLE notification_settings_next RENAME TO notification_settings;
