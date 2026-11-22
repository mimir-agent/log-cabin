-- Changing your sign-in email: the new address waits here until the link mailed to it is
-- opened. Adds only.
CREATE TABLE email_change_tokens (
	token_hash TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	new_email TEXT NOT NULL,
	expires_at INTEGER NOT NULL,
	used_at INTEGER,
	created_at INTEGER NOT NULL
);
CREATE INDEX email_change_tokens_user ON email_change_tokens (user_id);
