/**
 * jarvis_append_session_log — append an entry to the session log.
 *
 * Phase 2 will use this for SessionStart/SessionEnd hooks. Phase 1
 * exposes it so Claude can leave breadcrumbs ("created Test node from
 * conversation about Bocconi", etc.).
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const TYPES = [
  'session_start',
  'entry_added',
  'connection_made',
  'session_end',
  'note',
];

export const name = 'jarvis_append_session_log';
export const description =
  'Append a single-line breadcrumb to the per-event session log. CALL THIS every time you create, update, delete, or connect nodes during a Claude session — leaves a recoverable trail of what changed and why. One short sentence per call. (Different from jarvis_append_daily_log which is a once-per-session paragraph summary.)';
export const inputSchema = z
  .object({
    content: z.string().min(1),
    type: z.enum(TYPES).default('note'),
  })
  .strict();

export function handler({ content, type }, db) {
  const id = randomUUID();
  const ts = new Date().toISOString();
  db.prepare(
    `INSERT INTO session_log (id, timestamp, content, type) VALUES (?, ?, ?, ?)`,
  ).run(id, ts, content, type);
  return { id, timestamp: ts, content, type };
}
