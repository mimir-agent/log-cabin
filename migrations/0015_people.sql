-- People: usernames and profile URLs, status, last seen, cover photos, the theme setting,
-- and project covers. Adds only.

-- A username is lowercase letters, digits, "_" and "-", 2 to 32 characters, and unique.
-- SQLite can't add a NOT NULL column without a default, so the triggers below refuse a
-- missing or malformed one instead.
ALTER TABLE users ADD COLUMN username TEXT;

-- Existing people get one from their name: its ASCII letters and digits, lowercased. A name
-- with fewer than two of those becomes "member". The second person with the same name gets
-- "-2" on the end, the third "-3", by who joined first. The base has no "-", so a numbered
-- name can't collide with someone else's base. Anyone can change theirs later.
WITH RECURSIVE
	chars (id, rest, kept) AS (
		SELECT id, lower(name), '' FROM users
		UNION ALL
		SELECT
			id,
			substr(rest, 2),
			kept || CASE
				WHEN substr(rest, 1, 1) BETWEEN 'a' AND 'z' OR substr(rest, 1, 1) BETWEEN '0' AND '9'
				THEN substr(rest, 1, 1)
				ELSE ''
			END
		FROM chars
		WHERE rest <> ''
	),
	bases (id, base) AS (
		SELECT id, CASE WHEN length(kept) >= 2 THEN substr(kept, 1, 27) ELSE 'member' END
		FROM chars
		WHERE rest = ''
	),
	numbered (id, username) AS (
		SELECT id, base || CASE WHEN n = 1 THEN '' ELSE '-' || n END
		FROM (
			SELECT bases.id, bases.base,
				row_number() OVER (PARTITION BY bases.base ORDER BY users.created_at, users.id) AS n
			FROM bases JOIN users ON users.id = bases.id
		)
	)
UPDATE users SET username = (SELECT username FROM numbered WHERE numbered.id = users.id);

CREATE UNIQUE INDEX users_username ON users (username);

CREATE TRIGGER users_username_insert BEFORE INSERT ON users
WHEN NEW.username IS NULL
	OR length(NEW.username) NOT BETWEEN 2 AND 32
	OR NEW.username GLOB '*[^a-z0-9_-]*'
BEGIN
	SELECT RAISE(ABORT, 'users.username must be 2 to 32 of a-z, 0-9, "_" and "-"');
END;

CREATE TRIGGER users_username_update BEFORE UPDATE OF username ON users
WHEN NEW.username IS NULL
	OR length(NEW.username) NOT BETWEEN 2 AND 32
	OR NEW.username GLOB '*[^a-z0-9_-]*'
BEGIN
	SELECT RAISE(ABORT, 'users.username must be 2 to 32 of a-z, 0-9, "_" and "-"');
END;

-- A changed username keeps pointing at its person for 30 days, and nobody else can take it
-- until then.
CREATE TABLE username_redirects (
	username TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	expires_at INTEGER NOT NULL
);

-- Status: an emoji and a line of text, until status_expires_at (NULL: until cleared). No
-- status when status_text is NULL. The */5 cron clears expired ones.
ALTER TABLE users ADD COLUMN status_emoji TEXT;
ALTER TABLE users ADD COLUMN status_text TEXT;
ALTER TABLE users ADD COLUMN status_expires_at INTEGER;
CREATE INDEX users_status_expires_at ON users (status_expires_at)
	WHERE status_expires_at IS NOT NULL;

-- When the person last did something here: a signed-in request or a live connection,
-- written at most once a minute.
ALTER TABLE users ADD COLUMN last_seen_at INTEGER;

-- A 3:1 image above the profile.
ALTER TABLE users ADD COLUMN cover_key TEXT;

-- Light, dark, or follow the system.
ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'system'
	CHECK (theme IN ('system', 'light', 'dark'));

-- A 3:1 image at the top of a project.
ALTER TABLE projects ADD COLUMN cover_key TEXT;
