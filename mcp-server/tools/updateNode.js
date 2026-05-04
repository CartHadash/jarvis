/**
 * jarvis_update_node — patch a node's editable fields.
 */

import { z } from 'zod';
import { writeIndex } from '../db.js';

export const name = 'jarvis_update_node';
export const description =
  'Update one or more fields of an existing Jarvis node. Pass only the fields you want to change.';
const NODE_TYPES = ['concept', 'source', 'goal', 'decision', 'question', 'person', 'event'];
const STATUSES = ['seedling', 'growing', 'evergreen', 'stale'];
const CONFIDENCES = ['low', 'medium', 'high'];

export const inputSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().optional(),
    content: z.string().optional(),
    tags: z.array(z.string().min(1)).optional(),
    metadata: z.record(z.unknown()).optional(),
    node_type: z.enum(NODE_TYPES).optional(),
    status: z.enum(STATUSES).optional(),
    summary: z.string().nullable().optional(),
    source_url: z.string().nullable().optional(),
    confidence: z.enum(CONFIDENCES).nullable().optional(),
    review_due: z.string().nullable().optional(),
  })
  .strict();

const CLAUDE_PALETTE = [
  '#6b7280', '#ef4444', '#eab308', '#84cc16', '#10b981',
  '#06b6d4', '#0ea5e9', '#d946ef', '#f43f5e', '#a855f7',
];

export function handler({ id, title, content, tags, metadata, node_type, status, summary, source_url, confidence, review_due }, db) {
  const node = db.prepare(`SELECT * FROM nodes WHERE id = ?`).get(id);
  if (!node) throw new Error(`Node not found: ${id}`);

  const now = new Date().toISOString();

  // Backwards compat: extract v2 fields from metadata if not provided top-level.
  let cleanMeta = metadata;
  if (metadata) {
    const V2_KEYS = ['node_type', 'status', 'summary', 'source_url', 'confidence', 'review_due'];
    const m = { ...metadata };
    if (node_type === undefined && m.node_type !== undefined) node_type = m.node_type;
    if (status === undefined && m.status !== undefined) status = m.status;
    if (summary === undefined && m.summary !== undefined) summary = m.summary;
    if (source_url === undefined && m.source_url !== undefined) source_url = m.source_url;
    if (confidence === undefined && m.confidence !== undefined) confidence = m.confidence;
    if (review_due === undefined && m.review_due !== undefined) review_due = m.review_due;
    for (const k of V2_KEYS) delete m[k];
    cleanMeta = m;
  }

  const tx = db.transaction(() => {
    const sets = [];
    const args = [];
    if (title !== undefined) { sets.push('title = ?'); args.push(title); }
    if (content !== undefined) { sets.push('content = ?'); args.push(content); }
    if (cleanMeta !== undefined) { sets.push('metadata = ?'); args.push(JSON.stringify(cleanMeta)); }
    if (node_type !== undefined) { sets.push('node_type = ?'); args.push(node_type); }
    if (status !== undefined) { sets.push('status = ?'); args.push(status); }
    if (summary !== undefined) { sets.push('summary = ?'); args.push(summary); }
    if (source_url !== undefined) { sets.push('source_url = ?'); args.push(source_url); }
    if (confidence !== undefined) { sets.push('confidence = ?'); args.push(confidence); }
    if (review_due !== undefined) { sets.push('review_due = ?'); args.push(review_due); }
    sets.push('updated_at = ?'); args.push(now);
    args.push(id);

    db.prepare(`UPDATE nodes SET ${sets.join(', ')} WHERE id = ?`).run(...args);

    // Update tags if provided: delete + reinsert.
    if (tags !== undefined) {
      db.prepare(`DELETE FROM node_tags WHERE node_id = ?`).run(id);
      const insertTag = db.prepare(
        `INSERT OR IGNORE INTO node_tags (node_id, tag) VALUES (?, ?)`,
      );
      for (const tag of tags) {
        // Ensure tag exists.
        const exists = db.prepare(`SELECT 1 FROM tags WHERE name = ?`).get(tag);
        if (!exists) {
          const taken = new Set(
            db.prepare(`SELECT color FROM tags`).all().map((r) => r.color),
          );
          const color =
            CLAUDE_PALETTE.find((c) => !taken.has(c)) ?? CLAUDE_PALETTE[0];
          db.prepare(
            `INSERT INTO tags (name, color, created_at) VALUES (?, ?, ?)`,
          ).run(tag, color, now);
        }
        insertTag.run(id, tag);
      }
    }
  });
  tx();
  writeIndex(db);

  const updated = db.prepare(`SELECT * FROM nodes WHERE id = ?`).get(id);
  const nodeTags = db
    .prepare(`SELECT tag FROM node_tags WHERE node_id = ?`)
    .all(id)
    .map((r) => r.tag);
  return { ...updated, tags: nodeTags, metadata: JSON.parse(updated.metadata ?? '{}') };
}
