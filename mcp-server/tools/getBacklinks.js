/**
 * jarvis_get_backlinks — list nodes that link TO the given node.
 *
 * Forward connections are exposed by jarvis_get_node. Backlinks
 * (incoming references) are equally informative: a node with many
 * backlinks is a hub even if it points outward to nothing.
 */

import { z } from 'zod';

export const name = 'jarvis_get_backlinks';
export const description =
  'List every node that has an edge pointing TO the given node id. Returns lightweight rows: source id, source title, edge label.';
export const inputSchema = z.object({ id: z.string().min(1) }).strict();

export function handler({ id }, db) {
  const exists = db.prepare(`SELECT 1 FROM nodes WHERE id = ?`).get(id);
  if (!exists) throw new Error(`Node not found: ${id}`);
  const rows = db
    .prepare(
      `SELECT e.source AS source_id, n.title AS source_title, e.label, e.created_by, e.created_at
         FROM edges e
         JOIN nodes n ON n.id = e.source
        WHERE e.target = ?
     ORDER BY e.created_at DESC`,
    )
    .all(id);
  return { count: rows.length, backlinks: rows };
}
