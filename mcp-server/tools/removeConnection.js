/**
 * jarvis_remove_connection — remove an edge between two nodes.
 *
 * Tries both directions since edges are undirected from the user's
 * perspective.
 */

import { z } from 'zod';
import { writeIndex } from '../db.js';

export const name = 'jarvis_remove_connection';
export const description =
  'Remove the connection between two Jarvis nodes (either direction).';
export const inputSchema = z
  .object({
    source: z.string().min(1),
    target: z.string().min(1),
  })
  .strict();

export function handler({ source, target }, db) {
  const info = db
    .prepare(
      `DELETE FROM edges
         WHERE (source = ? AND target = ?) OR (source = ? AND target = ?)`,
    )
    .run(source, target, target, source);
  writeIndex(db);
  return { removed: info.changes };
}
