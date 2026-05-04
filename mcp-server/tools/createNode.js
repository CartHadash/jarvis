/**
 * jarvis_create_node — create a new node and (optionally) connect it.
 *
 * Tags are stored in the `node_tags` junction table. If a tag doesn't
 * exist yet in the `tags` table, we auto-create it with a fallback grey.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { writeIndex } from '../db.js';

export const name = 'jarvis_create_node';
export const description =
  'Create a new Jarvis node. Requires node_type, summary, and at least one tag. Optionally pass connections to wire it up immediately.';

const NODE_TYPES = ['concept', 'source', 'goal', 'decision', 'question', 'person', 'event'];
const STATUSES = ['seedling', 'growing', 'evergreen', 'stale'];
const CONFIDENCES = ['low', 'medium', 'high'];

export const inputSchema = z
  .object({
    title: z.string().min(1),
    content: z.string().default(''),
    tags: z.array(z.string().min(1)).min(1),
    metadata: z.record(z.unknown()).default({}),
    connections: z.array(z.string()).default([]),
    node_type: z.enum(NODE_TYPES),
    status: z.enum(STATUSES).default('seedling'),
    summary: z.string().min(1),
    source_url: z.string().optional(),
    confidence: z.enum(CONFIDENCES).optional(),
    review_due: z.string().optional(),
  })
  .strict();

const CLAUDE_PALETTE = [
  '#6b7280', '#ef4444', '#eab308', '#84cc16', '#10b981',
  '#06b6d4', '#0ea5e9', '#d946ef', '#f43f5e', '#a855f7',
];

export function handler({ title, content, tags, metadata, connections, node_type, status, summary, source_url, confidence, review_due }, db) {
  const id = randomUUID();
  const now = new Date().toISOString();

  // Backwards compat: extract v2 fields from metadata if not provided top-level.
  const V2_KEYS = ['node_type', 'status', 'summary', 'source_url', 'confidence', 'review_due'];
  const m = { ...metadata };
  if (!node_type && m.node_type) node_type = m.node_type;
  if (!status && m.status) status = m.status;
  if (!summary && m.summary) summary = m.summary;
  if (!source_url && m.source_url) source_url = m.source_url;
  if (!confidence && m.confidence) confidence = m.confidence;
  if (!review_due && m.review_due) review_due = m.review_due;
  // Strip extracted keys from metadata to avoid duplication.
  for (const k of V2_KEYS) delete m[k];

  // Auto-extract summary from first blockquote if not provided.
  if (!summary && content) {
    const bqMatch = content.match(/^>\s*(.+)/m);
    if (bqMatch) summary = bqMatch[1].trim();
  }

  const tx = db.transaction(() => {
    // Ensure each tag exists in the tags table.
    for (const tag of tags) {
      const exists = db
        .prepare(`SELECT 1 FROM tags WHERE name = ?`)
        .get(tag);
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
    }

    db.prepare(
      `INSERT INTO nodes (id, title, content, created_at, updated_at, metadata,
                          node_type, status, summary, source_url, confidence, review_due, captured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, title, content, now, now, JSON.stringify(m),
          node_type, status, summary ?? null, source_url ?? null, confidence ?? null, review_due ?? null, now);

    // Insert into junction table.
    const insertTag = db.prepare(
      `INSERT OR IGNORE INTO node_tags (node_id, tag) VALUES (?, ?)`,
    );
    for (const tag of tags) {
      insertTag.run(id, tag);
    }

    for (const target of connections) {
      const tgt = db.prepare(`SELECT 1 FROM nodes WHERE id = ?`).get(target);
      if (!tgt) continue;
      db.prepare(
        `INSERT OR IGNORE INTO edges (id, source, target, label, created_at, created_by)
           VALUES (?, ?, ?, 'related_to', ?, 'claude')`,
      ).run(randomUUID(), id, target, now);
    }
  });
  tx();
  writeIndex(db);

  const node = db.prepare(`SELECT * FROM nodes WHERE id = ?`).get(id);
  const nodeTags = db
    .prepare(`SELECT tag FROM node_tags WHERE node_id = ?`)
    .all(id)
    .map((r) => r.tag);
  return { ...node, tags: nodeTags, metadata: JSON.parse(node.metadata ?? '{}') };
}
