-- v5: per-node revision history. Captures the *previous* values of
-- title, content, summary on every UPDATE so the UI can show diffs
-- across edits. Old rows are kept indefinitely; if this becomes a
-- size problem later, prune by node_id + version count.

CREATE TABLE IF NOT EXISTS node_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id       TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  summary       TEXT,
  edited_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_node_history_node_version
  ON node_history(node_id, version DESC);

-- Trigger: before each UPDATE on nodes, snapshot the OLD values into
-- node_history. We use BEFORE so the row in `nodes` we read is the
-- pre-update state. The version is the existing max for this node + 1.
CREATE TRIGGER IF NOT EXISTS node_history_snapshot
BEFORE UPDATE OF title, content, summary ON nodes
FOR EACH ROW
WHEN (OLD.title <> NEW.title OR OLD.content <> NEW.content OR coalesce(OLD.summary, '') <> coalesce(NEW.summary, ''))
BEGIN
  INSERT INTO node_history (node_id, version, title, content, summary, edited_at)
  VALUES (
    OLD.id,
    coalesce((SELECT MAX(version) FROM node_history WHERE node_id = OLD.id), 0) + 1,
    OLD.title,
    OLD.content,
    OLD.summary,
    OLD.updated_at
  );
END;
