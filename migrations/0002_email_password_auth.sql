CREATE TABLE IF NOT EXISTS auth_users (
	email TEXT PRIMARY KEY COLLATE NOCASE,
	name TEXT NOT NULL,
	password_hash TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_challenges (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL COLLATE NOCASE,
	name TEXT NOT NULL,
	password_hash TEXT NOT NULL,
	code_hash TEXT NOT NULL,
	purpose TEXT NOT NULL CHECK (purpose IN ('login', 'register', 'reset')),
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	last_sent_at INTEGER NOT NULL,
	attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_expiry ON auth_challenges(expires_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL COLLATE NOCASE REFERENCES auth_users(email) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
	key TEXT PRIMARY KEY,
	window_started_at INTEGER NOT NULL,
	count INTEGER NOT NULL
);
