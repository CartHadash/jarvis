/**
 * jarvis_get_node — fetch full node detail (incl. content, tags, edges).
 *
 * `content` is converted from TipTap HTML to markdown by default to save
 * tokens. Pass `format: 'html'` to keep the raw HTML when you need
 * structural fidelity.
 */

import { z } from 'zod';
import { htmlToMarkdown } from '../lib/htmlToMarkdown.js';

export const name = 'jarvis_get_node';
export const description =
  'Fetch the full content of a Jarvis node by id, including its tags and connections. Content is returned as markdown by default.';
export const inputSchema = z
  .object({
    id: z.string().min(1),
    format: z.enum(['markdown', 'html']).default('markdown'),
  })
  .strict();

export function handler({ id, format = 'markdown' }, db) {
  return fetchNode(id, format, db);
}

export function fetchNode(id, format, db) {
  const node = db.prepare(`SELECT * FROM nodes WHERE id = ?`).get(id);
  if (!node) throw new Error(`Node not found: ${id}`);
  const tags = db
    .prepare(`SELECT tag FROM node_tags WHERE node_id = ?`)
    .all(id)
    .map((r) => r.tag);
  const edges = db
    .prepare(
      `SELECT id, source, target, label, created_at, created_by
         FROM edges WHERE source = ? OR target = ?`,
    )
    .all(id, id);
  return {
    ...node,
    content: format === 'html' ? node.content : htmlToMarkdown(node.content),
    tags,
    metadata: safeJson(node.metadata),
    connections: edges.map((e) => (e.source === id ? e.target : e.source)),
    edges,
  };
}

function safeJson(s) {
  try {
    return JSON.parse(s ?? '{}');
  } catch {
    return {};
  }
}
