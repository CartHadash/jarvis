/**
 * jarvis_recent_log — return the last N days of daily session logs.
 *
 * Acceptance: call `jarvis_recent_log(7)` from any Claude session and
 * get recent activity summaries.
 */

import { z } from 'zod';

export const name = 'jarvis_recent_log';
export const description =
  'Return the last N days of daily session logs. Use to recall what happened in recent Claude sessions.';
export const inputSchema = z
  .object({
    days: z
      .number()
      .int()
      .min(1)
      .max(90)
      .default(7)
      .describe('Number of days to look back (default 7)'),
  })
  .strict();

export function handler({ days }, db) {
  // Defensive: ensure table exists if MCP server runs before Tauri app v4 migration.
  db.exec(`CREATE TABLE IF NOT EXISTS daily_logs (
    date TEXT PRIMARY KEY, summary TEXT NOT NULL, model TEXT, token_count INTEGER
  )`);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const rows = db
    .prepare(
      `SELECT date, summary, model, token_count
       FROM daily_logs
       WHERE date >= ?
       ORDER BY date DESC`,
    )
    .all(cutoffStr);

  return { days, count: rows.length, logs: rows };
}
