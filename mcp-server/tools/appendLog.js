/**
 * jarvis_append_log — append a summary to today's daily log.
 *
 * If a log already exists for today, the new summary is appended
 * (separated by double newline). This is the write side of session
 * continuity — Claude calls this at session end when auto-log is on.
 */

import { z } from 'zod';

export const name = 'jarvis_append_daily_log';
export const description =
  'Append a one-paragraph summary of the current Claude session to today\'s daily log. CALL THIS at the end of a session (or when wrapping a coherent block of work) so a future Claude can recall what was discussed. One paragraph, not one line. Pair with jarvis_recent_daily_logs to read these back. Different from jarvis_append_session_log (per-action breadcrumbs).';
export const inputSchema = z
  .object({
    summary: z
      .string()
      .min(1)
      .describe('One-paragraph summary of this session'),
    model: z
      .string()
      .optional()
      .describe('Model name (e.g. claude-sonnet-4-20250514)'),
    token_count: z
      .number()
      .int()
      .optional()
      .describe('Approximate token count for the session'),
  })
  .strict();

export function handler({ summary, model, token_count }, db) {
  // Defensive: ensure table exists if MCP server runs before Tauri app v4 migration.
  db.exec(`CREATE TABLE IF NOT EXISTS daily_logs (
    date TEXT PRIMARY KEY, summary TEXT NOT NULL, model TEXT, token_count INTEGER
  )`);

  const today = new Date().toISOString().slice(0, 10);

  const existing = db
    .prepare('SELECT summary FROM daily_logs WHERE date = ?')
    .get(today);

  const finalSummary = existing
    ? `${existing.summary}\n\n${summary}`
    : summary;

  db.prepare(
    `INSERT INTO daily_logs(date, summary, model, token_count)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       summary = ?,
       model = COALESCE(?, daily_logs.model),
       token_count = COALESCE(?, daily_logs.token_count)`,
  ).run(today, finalSummary, model ?? null, token_count ?? null,
        finalSummary, model ?? null, token_count ?? null);

  return { date: today, summary: finalSummary, model: model ?? null, token_count: token_count ?? null };
}
