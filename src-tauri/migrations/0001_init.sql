-- Jarvis schema (current: tags-based, no single category column).
--
-- Idempotent: re-running on an existing DB is safe (CREATE IF NOT EXISTS,
-- and seed insertions are guarded by `SELECT count(*) FROM nodes` in
-- Rust, not in this file — keeps the migration declarative).

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS nodes (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  metadata    TEXT NOT NULL DEFAULT '{}',
  node_type   TEXT NOT NULL DEFAULT 'concept',
  status      TEXT NOT NULL DEFAULT 'seedling',
  summary     TEXT,
  source_url  TEXT,
  confidence  TEXT,
  review_due  TEXT,
  captured_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_nodes_updated ON nodes(updated_at DESC);

CREATE TABLE IF NOT EXISTS edges (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target      TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  label       TEXT,
  created_at  TEXT NOT NULL,
  created_by  TEXT NOT NULL CHECK (created_by IN ('user','claude')),
  UNIQUE(source, target)
);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);

CREATE TABLE IF NOT EXISTS tags (
  name       TEXT PRIMARY KEY,
  color      TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS node_tags (
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  tag     TEXT NOT NULL REFERENCES tags(name) ON DELETE CASCADE,
  PRIMARY KEY (node_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_node_tags_tag ON node_tags(tag);

CREATE TABLE IF NOT EXISTS session_log (
  id         TEXT PRIMARY KEY,
  timestamp  TEXT NOT NULL,
  content    TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN
             ('session_start','entry_added','connection_made','session_end','note'))
);
CREATE INDEX IF NOT EXISTS idx_session_log_ts ON session_log(timestamp DESC);

-- FTS5 mirror over (title, content). Triggers below keep it in sync.
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  title,
  content,
  content='nodes',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS nodes_fts_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;
CREATE TRIGGER IF NOT EXISTS nodes_fts_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
END;
CREATE TRIGGER IF NOT EXISTS nodes_fts_au AFTER UPDATE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
  INSERT INTO nodes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;
