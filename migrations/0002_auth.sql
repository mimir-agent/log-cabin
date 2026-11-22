-- Sign-in, invites and org settings.

-- Whether the sign-in page offers Google. It only appears when GOOGLE_CLIENT_ID and
-- GOOGLE_CLIENT_SECRET are also set.
ALTER TABLE org ADD COLUMN google_sign_in INTEGER NOT NULL DEFAULT 1;

-- Emailed sign-in links. The link carries a random token; only its SHA-256 hash is stored.
-- A token works once, within 15 minutes.
CREATE TABLE sign_in_tokens (
	token_hash TEXT PRIMARY KEY,
	email TEXT NOT NULL COLLATE NOCASE,
	expires_at INTEGER NOT NULL,
	used_at INTEGER,
	created_at INTEGER NOT NULL
);

-- One row per sign-in link request, keyed 'email:<address>' or 'ip:<address>'.
CREATE TABLE sign_in_attempts (
	key TEXT NOT NULL,
	created_at INTEGER NOT NULL
);
CREATE INDEX sign_in_attempts_key ON sign_in_attempts (key, created_at);

-- An invite with an email is for that person and works once. An invite without one is a
-- shareable link: anyone with it can ask for an invite to their own email until it expires.
CREATE TABLE invites (
	id TEXT PRIMARY KEY,
	token_hash TEXT NOT NULL UNIQUE,
	email TEXT COLLATE NOCASE,
	role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer', 'guest')),
	invited_by TEXT NOT NULL REFERENCES members (id),
	expires_at INTEGER NOT NULL,
	accepted_at INTEGER,
	revoked_at INTEGER,
	created_at INTEGER NOT NULL
);
CREATE INDEX invites_email ON invites (email);

-- Members are searchable by name and email.
INSERT INTO search_index (kind, ref_id, project_id, visibility, owner_id, title, body)
SELECT 'member', members.id, NULL, 'org', users.id, users.name, users.email
FROM members JOIN users ON users.id = members.user_id;

CREATE TRIGGER members_search_insert AFTER INSERT ON members BEGIN
	INSERT INTO search_index (kind, ref_id, project_id, visibility, owner_id, title, body)
	SELECT 'member', NEW.id, NULL, 'org', users.id, users.name, users.email
	FROM users WHERE users.id = NEW.user_id;
END;

CREATE TRIGGER members_search_delete AFTER DELETE ON members BEGIN
	DELETE FROM search_index WHERE kind = 'member' AND ref_id = OLD.id;
END;

CREATE TRIGGER users_search_update AFTER UPDATE OF name, email ON users BEGIN
	UPDATE search_index SET title = NEW.name, body = NEW.email
	WHERE kind = 'member' AND owner_id = NEW.id;
END;
