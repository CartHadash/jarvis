/**
 * jarvis_get_tags — list known tags with their colours and node counts.
 */

import { z } from 'zod';

export const name = 'jarvis_get_tags';
export const description =
  'List all tags Jarvis knows about (name + colour + count). Useful before creating a node so you can match an existing tag instead of inventing a new one.';
export const inputSchema = z.object({}).strict();

export function handler(_args, db) {
  const rows = db
    .prepare(`SELECT name, color, created_at FROM tags ORDER BY name`)
    .all();
  const counts = db
    .prepare(`SELECT tag, COUNT(*) as n FROM node_tags GROUP BY tag`)
    .all();
  const countMap = Object.fromEntries(counts.map((r) => [r.tag, r.n]));
  return {
    tags: rows.map((r) => ({ ...r, count: countMap[r.name] ?? 0 })),
  };
}
