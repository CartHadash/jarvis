/**
 * jarvis_bulk_get — fetch full content for many nodes in one call.
 *
 * Replaces N round-trips of `jarvis_get_node`, eliminating N MCP
 * envelope-token overheads. Reuses getNode's per-node fetch so the
 * shapes stay identical.
 */

import { z } from 'zod';
import { fetchNode } from './getNode.js';

export const name = 'jarvis_bulk_get';
export const description =
  'Fetch FULL content for up to 100 nodes in a single call. USE THIS instead of multiple jarvis_get_node calls whenever you need ≥2 nodes — eliminates per-call envelope overhead and is much cheaper than looping. Same per-node shape as jarvis_get_node. Missing ids are reported in `notFound`. Content is markdown by default. If you only need summaries, prefer jarvis_get_summaries.';
export const inputSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(100),
    format: z.enum(['markdown', 'html']).default('markdown'),
  })
  .strict();

export function handler({ ids, format = 'markdown' }, db) {
  const nodes = [];
  const notFound = [];
  for (const id of ids) {
    try {
      nodes.push(fetchNode(id, format, db));
    } catch {
      notFound.push(id);
    }
  }
  return { count: nodes.length, nodes, notFound };
}
