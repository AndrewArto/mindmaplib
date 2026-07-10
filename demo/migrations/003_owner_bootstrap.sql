-- Persist first-visit sample seeding independently from session rows.
-- Deleting the sample does not make the same anonymous owner eligible again.

CREATE TABLE IF NOT EXISTS owner_bootstraps (
  owner_hash TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  created TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A short-lived handoff makes legacy-cookie rotation idempotent across
-- concurrent tabs without accepting the legacy bearer indefinitely.
CREATE TABLE IF NOT EXISTS owner_migrations (
  legacy_hash TEXT PRIMARY KEY,
  next_hash TEXT NOT NULL,
  expires TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_owner_migrations_expires
  ON owner_migrations(expires);

-- Existing anonymous owners have already completed their first visit. Mark one
-- current session per owner so deleting all of their maps cannot seed again.
INSERT OR IGNORE INTO owner_bootstraps (
  owner_hash,
  session_id,
  claim_id,
  created
)
SELECT
  owner_hash,
  MIN(id),
  'migration:' || owner_hash,
  MIN(created)
FROM sessions
WHERE owner_hash IS NOT NULL
GROUP BY owner_hash;
