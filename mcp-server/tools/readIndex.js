/**
 * jarvis_read_index — return the lightweight node index.
 *
 * Cheap context for Claude: id, title, tags, updated_at for every
 * node, sorted by recency. Reads live from SQLite so it's never stale.
 */

import { z } from 'zod';

export const name = 'jarvis_read_index';
export const description =
  'Return the full Jarvis node index (id, title, tags, updated_at). Use this first to discover what exists.';
export const inputSchema = z.object({}).strict();

export function handler(_args, db) {
  const rows = db
    .prepare(
      `SELECT id, title, updated_at, node_type, status, summary FROM nodes ORDER BY updated_at DESC`,
    )
    .all();
  // Hydrate tags from junction table.
  const tagRows = db.prepare(`SELECT node_id, tag FROM node_tags`).all();
  const tagMap = new Map();
  for (const r of tagRows) {
    if (!tagMap.has(r.node_id)) tagMap.set(r.node_id, []);
    tagMap.get(r.node_id).push(r.tag);
  }
  const nodes = rows.map((r) => ({
    ...r,
    tags: tagMap.get(r.id) ?? [],
  }));
  return { count: nodes.length, nodes };
}
