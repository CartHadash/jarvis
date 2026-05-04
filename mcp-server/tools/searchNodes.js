/**
 * jarvis_search_nodes — full-text search via FTS5.
 *
 * Sanitises the user query (FTS5 has its own micro-syntax that errors
 * out on stray punctuation) and adds prefix matching so half-words match.
 */

import { z } from 'zod';

export const name = 'jarvis_search_nodes';
export const description =
  'Search Jarvis nodes by title and content using full-text search. Returns matching nodes with relevance ordering.';
const NODE_TYPES = ['concept', 'source', 'goal', 'decision', 'question', 'person', 'event'];
const STATUSES = ['seedling', 'growing', 'evergreen', 'stale'];

export const inputSchema = z
  .object({
    query: z.string().min(1),
    limit: z.number().int().positive().max(200).default(20),
    node_type: z.enum(NODE_TYPES).optional(),
    status: z.enum(STATUSES).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

export function handler({ query, limit, node_type, status, tags: filterTags }, db) {
  const fts = sanitize(query);
  if (!fts) return { count: 0, nodes: [] };

  // Build SQL with optional filters pushed into the query for correct LIMIT behavior.
  let sql = `SELECT n.id, n.title, n.updated_at, n.content,
              n.node_type, n.status, n.summary, n.source_url, n.confidence, n.review_due, n.captured_at
         FROM nodes_fts
         JOIN nodes n ON n.rowid = nodes_fts.rowid
         WHERE nodes_fts MATCH ?`;
  const args = [fts];

  if (node_type) { sql += ` AND n.node_type = ?`; args.push(node_type); }
  if (status) { sql += ` AND n.status = ?`; args.push(status); }

  sql += ` ORDER BY bm25(nodes_fts) LIMIT ?`;
  args.push(limit);

  let rows = db.prepare(sql).all(...args);

  // Hydrate tags.
  const ids = rows.map((r) => r.id);
  const tagMap = new Map();
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const tagRows = db
      .prepare(`SELECT node_id, tag FROM node_tags WHERE node_id IN (${placeholders})`)
      .all(...ids);
    for (const r of tagRows) {
      if (!tagMap.has(r.node_id)) tagMap.set(r.node_id, []);
      tagMap.get(r.node_id).push(r.tag);
    }
  }

  let nodes = rows.map((r) => ({
    ...r,
    tags: tagMap.get(r.id) ?? [],
  }));

  // Tag filter (AND match): node must have ALL requested tags.
  if (filterTags && filterTags.length > 0) {
    nodes = nodes.filter((n) => filterTags.every((t) => n.tags.includes(t)));
  }

  return { count: nodes.length, nodes };
}

function sanitize(q) {
  const tokens = q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}*`).join(' ');
}
