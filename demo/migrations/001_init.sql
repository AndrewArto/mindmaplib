-- mindmap-demo D1 schema
-- Database: mindmap-demo (38fe5bc4-864e-419e-80e6-cb5684caf663)

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled Mindmap',
  doc_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  created TEXT NOT NULL DEFAULT (datetime('now')),
  updated TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated DESC);
