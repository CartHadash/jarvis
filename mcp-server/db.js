/**
 * db.js — shared SQLite open + path resolution.
 *
 * The MCP server opens the SAME file the Tauri app writes to. WAL mode
 * (set by the Tauri side on first open) makes concurrent reads + a
 * single writer safe, which is all we need.
 *
 * Path resolution priority:
 *   1. JARVIS_DB_PATH env var (override for tests / custom installs)
 *   2. macOS:  ~/Library/Application Support/app.jarvis/jarvis.db
 *   3. Linux:  ~/.local/share/app.jarvis/jarvis.db
 *   4. Win:    %APPDATA%\\app.jarvis\\jarvis.db
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';

const APP_ID = 'app.jarvis';

export function resolveDbPath() {
  if (process.env.JARVIS_DB_PATH) return process.env.JARVIS_DB_PATH;
  const home = homedir();
  switch (platform()) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', APP_ID, 'jarvis.db');
    case 'win32':
      return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), APP_ID, 'jarvis.db');
    default:
      return join(
        process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'),
        APP_ID,
        'jarvis.db',
      );
  }
}

let cached;

export function openDb() {
  if (cached) return cached;
  const path = resolveDbPath();
  if (!existsSync(path)) {
    // Create the parent directory but don't seed — the Tauri app owns
    // schema + seed. If the user hasn't launched the app yet we surface
    // a useful error instead of writing a broken empty file.
    mkdirSync(dirname(path), { recursive: true });
    throw new Error(
      `Jarvis database not found at ${path}. Launch the Jarvis app at least once before running the MCP server.`,
    );
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  cached = db;
  return db;
}

/** Re-write the index file the Tauri app uses for cheap snapshots. */
export function writeIndex(db) {
  const dir = dirname(resolveDbPath());
  const indexPath = join(dir, 'jarvis_index.json');
  const rows = db
    .prepare(
      `SELECT id, title, updated_at, node_type, status, summary FROM nodes ORDER BY updated_at DESC`,
    )
    .all();
  // Hydrate tags from junction table.
  const tagRows = db.prepare(`SELECT node_id, tag FROM node_tags`).all();
  const tagMap = new Map();
  for (const r of tagRows) {
    if (!tagMap.has(r.node_id)) tagMap.set(r.node_id, []);
    tagMap.get(r.node_id).push(r.tag);
  }
  const nodes = rows.map((r) => ({
    ...r,
    tags: tagMap.get(r.id) ?? [],
  }));
  writeFileSync(indexPath, JSON.stringify({ nodes }, null, 2));
}
