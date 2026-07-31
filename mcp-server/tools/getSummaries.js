/**
 * jarvis_get_summaries — cheap context retrieval for multiple nodes.
 *
 * Returns only id, title, summary, node_type, and tags for each
 * requested node. Used when Claude needs to understand many related
 * nodes without loading their full content.
 */

import { z } from 'zod';

export const name = 'jarvis_get_summaries';
export const description =
  'Return lightweight summaries (id, title, summary, node_type, tags) for an array of node ids. USE THIS instead of jarvis_get_node when you need to scan multiple nodes (≥3) and only need their gist — the `summary` field tells you whether a node is relevant before paying for full content. Cheapest multi-node retrieval available; prefer over jarvis_bulk_get when you do not need full content.';
export const inputSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1),
  })
  .strict();

export function handler({ ids }, db) {
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT id, title, summary, node_type, status
         FROM nodes WHERE id IN (${placeholders})`,
    )
    .all(...ids);

  // Hydrate tags.
  const tagRows = db
    .prepare(`SELECT node_id, tag FROM node_tags WHERE node_id IN (${placeholders})`)
    .all(...ids);
  const tagMap = new Map();
  for (const r of tagRows) {
    if (!tagMap.has(r.node_id)) tagMap.set(r.node_id, []);
    tagMap.get(r.node_id).push(r.tag);
  }

  const nodes = rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    node_type: r.node_type,
    status: r.status,
    tags: tagMap.get(r.id) ?? [],
  }));

  return { count: nodes.length, nodes };
}
