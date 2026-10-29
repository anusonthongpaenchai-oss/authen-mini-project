CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  remember_me INTEGER NOT NULL CHECK (remember_me IN (0, 1)),
  refresh_token_hash TEXT,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  CHECK (
    (remember_me = 0 AND refresh_token_hash IS NULL)
    OR (remember_me = 1 AND refresh_token_hash IS NOT NULL)
  )
) STRICT;

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
