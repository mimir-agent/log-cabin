-- Core tables. Numbers 0002–0010 are reserved, one per module:
-- 0002 auth, 0003 posts, 0004 notes, 0005 chat, 0006 notifications,
-- 0007 search, 0008 ai, 0009 calls, 0010 calcom.
-- A module that needs a second migration uses 00NN_b_<name>.sql.
-- IDs are text from newId(); timestamps are integer milliseconds since the epoch.

-- The organization this deployment serves. There is exactly one row once setup has run.
CREATE TABLE org (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	name TEXT NOT NULL,
	logo_key TEXT,
	allowed_email_domain TEXT,
	created_at INTEGER NOT NULL
);

CREATE TABLE users (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE COLLATE NOCASE,
	name TEXT NOT NULL,
	avatar_key TEXT,
	timezone TEXT NOT NULL DEFAULT 'UTC',
	created_at INTEGER NOT NULL
);

CREATE TABLE members (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
	role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer', 'guest')),
	deactivated_at INTEGER,
	created_at INTEGER NOT NULL
);

-- The cookie holds a random token; only its SHA-256 hash is stored.
CREATE TABLE sessions (
	token_hash TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	expires_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user_id ON sessions (user_id);

-- Mail written by the "log" transport, readable at /__mail when MAIL_VIEWER_TOKEN is set.
CREATE TABLE dev_mail (
	id TEXT PRIMARY KEY,
	to_address TEXT NOT NULL,
	from_address TEXT NOT NULL,
	subject TEXT NOT NULL,
	text_body TEXT NOT NULL,
	html_body TEXT,
	created_at INTEGER NOT NULL
);

-- One row per domain event the JOBS consumer processed.
CREATE TABLE job_log (
	id TEXT PRIMARY KEY,
	kind TEXT NOT NULL,
	payload TEXT NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('done', 'unhandled', 'failed')),
	error TEXT,
	created_at INTEGER NOT NULL
);
CREATE INDEX job_log_created_at ON job_log (created_at);

-- Full-text index shared by every module. Each module keeps its own rows current
-- with triggers in its own migration; search only queries this table.
--   kind        'post' | 'comment' | 'note' | 'message' | 'member' | ...
--   ref_id      id of the row in the module's table
--   project_id  project the row belongs to, or NULL
--   visibility  'org' (any member), 'project' (members of project_id), 'private' (owner_id only)
--   owner_id    user id of the author or owner
CREATE VIRTUAL TABLE search_index USING fts5 (
	kind UNINDEXED,
	ref_id UNINDEXED,
	project_id UNINDEXED,
	visibility UNINDEXED,
	owner_id UNINDEXED,
	title,
	body,
	tokenize = 'porter unicode61'
);
