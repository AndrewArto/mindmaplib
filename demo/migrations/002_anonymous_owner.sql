-- Scope saved demo sessions to anonymous browser owners.
-- Existing rows keep owner_hash = NULL and are hidden from anonymous owners.

ALTER TABLE sessions ADD COLUMN owner_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_owner_updated
  ON sessions(owner_hash, updated DESC);
