/**
 * jarvis_add_connection — create an edge between two existing nodes.
 *
 * Always tagged created_by="claude" so the UI can render it dashed.
 * Idempotent thanks to UNIQUE(source, target).
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { writeIndex } from '../db.js';

export const name = 'jarvis_add_connection';
export const description =
  'Create a directed connection (edge) between two existing Jarvis nodes. The label must be one of the eight semantic types. Idempotent.';

const EDGE_LABELS = [
  'supports', 'contradicts', 'example_of', 'prerequisite_for',
  'part_of', 'related_to', 'inspired_by', 'replaces',
];

export const inputSchema = z
  .object({
    source: z.string().min(1),
    target: z.string().min(1),
    label: z.enum(EDGE_LABELS),
  })
  .strict();

export function handler({ source, target, label }, db) {
  if (source === target) throw new Error('Cannot connect a node to itself.');
  const s = db.prepare(`SELECT 1 FROM nodes WHERE id = ?`).get(source);
  const t = db.prepare(`SELECT 1 FROM nodes WHERE id = ?`).get(target);
  if (!s) throw new Error(`Source node not found: ${source}`);
  if (!t) throw new Error(`Target node not found: ${target}`);

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO edges (id, source, target, label, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, 'claude')
       ON CONFLICT(source, target) DO UPDATE SET label = COALESCE(excluded.label, edges.label)`,
  ).run(id, source, target, label ?? null, now);
  writeIndex(db);

  return db
    .prepare(`SELECT * FROM edges WHERE source = ? AND target = ?`)
    .get(source, target);
}
