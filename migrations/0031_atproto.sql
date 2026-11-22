-- AT Protocol identities: one DID per account and one account per DID. Adds only.

-- Off everywhere until an admin turns it on.
ALTER TABLE org ADD COLUMN at_sign_in INTEGER NOT NULL DEFAULT 0;

-- The DID is the key. The handle is for display and is null whenever it isn't verified.
CREATE TABLE atproto_identities (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  did TEXT NOT NULL UNIQUE,
  handle TEXT,
  handle_verified_at INTEGER,
  checked_at INTEGER NOT NULL,
  shown INTEGER NOT NULL DEFAULT 1,
  profile_url TEXT,
  created_at INTEGER NOT NULL
);

-- The OAuth client's state store. A state lives 10 minutes and is deleted when read.
CREATE TABLE atproto_oauth_states (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
