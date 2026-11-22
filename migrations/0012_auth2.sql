-- Passwords, password reset and two-factor sign-in.

-- 'pbkdf2$<iterations>$<salt>$<hash>', salt and hash in base64. NULL: no password set, so
-- the person signs in by emailed link or Google only.
ALTER TABLE users ADD COLUMN password_hash TEXT;

-- The authenticator secret (base32). It is written when someone starts turning two-factor
-- on and counts only once totp_enabled_at is set. totp_last_step is the 30-second step of
-- the last code accepted, so a code can't be used twice.
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled_at INTEGER;
ALTER TABLE users ADD COLUMN totp_last_step INTEGER;

-- Emailed reset links. Only the token's SHA-256 hash is stored; a link works once, within
-- 30 minutes.
CREATE TABLE password_reset_tokens (
	token_hash TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	expires_at INTEGER NOT NULL,
	used_at INTEGER,
	created_at INTEGER NOT NULL
);

-- Ten single-use codes for when the authenticator is lost, stored as SHA-256 hashes.
CREATE TABLE recovery_codes (
	code_hash TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	used_at INTEGER,
	created_at INTEGER NOT NULL
);
CREATE INDEX recovery_codes_user ON recovery_codes (user_id);

-- A sign-in that passed its first method and waits for a two-factor code. The browser holds
-- the token in a cookie; only its hash is stored.
CREATE TABLE two_factor_challenges (
	token_hash TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	expires_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);
