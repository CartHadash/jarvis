-- v2 schema additions: structured node fields + edge label defaults.
-- Applied conditionally from Rust (check for node_type column).

ALTER TABLE nodes ADD COLUMN node_type TEXT NOT NULL DEFAULT 'concept';
ALTER TABLE nodes ADD COLUMN status TEXT NOT NULL DEFAULT 'seedling';
ALTER TABLE nodes ADD COLUMN summary TEXT;
ALTER TABLE nodes ADD COLUMN source_url TEXT;
ALTER TABLE nodes ADD COLUMN confidence TEXT;
ALTER TABLE nodes ADD COLUMN review_due TEXT;
ALTER TABLE nodes ADD COLUMN captured_at TEXT;

-- Backfill captured_at from created_at for existing rows.
UPDATE nodes SET captured_at = created_at WHERE captured_at IS NULL;

-- Default-populate edge labels for existing unlabeled edges.
UPDATE edges SET label = 'related_to' WHERE label IS NULL;
