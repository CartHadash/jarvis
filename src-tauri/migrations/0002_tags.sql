-- Migration: single category → many-to-many tags system.
--
-- 1. Rename categories → tags
-- 2. Create junction table node_tags
-- 3. Migrate existing node.category values into node_tags
-- 4. Drop the category column from nodes
-- 5. Drop the now-unused idx_nodes_category index

-- Rename categories → tags (preserves existing colour assignments)
ALTER TABLE categories RENAME TO tags;

-- Junction table: many-to-many relationship between nodes and tags
CREATE TABLE IF NOT EXISTS node_tags (
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  tag     TEXT NOT NULL REFERENCES tags(name) ON DELETE CASCADE,
  PRIMARY KEY (node_id, tag)
);

-- Migrate: each node's single category becomes its first tag
INSERT OR IGNORE INTO node_tags (node_id, tag)
  SELECT id, category FROM nodes WHERE category IS NOT NULL AND category != '';

-- Drop the old column and its index
DROP INDEX IF EXISTS idx_nodes_category;
ALTER TABLE nodes DROP COLUMN category;

-- Index for efficient tag lookups
CREATE INDEX IF NOT EXISTS idx_node_tags_tag ON node_tags(tag);
