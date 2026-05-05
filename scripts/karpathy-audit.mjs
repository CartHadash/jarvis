#!/usr/bin/env node
/**
 * Karpathy "second-brain" audit — read-only.
 *
 * Scores every node in the live SQLite database against four
 * principles drawn from Karpathy's notes-for-LLMs philosophy:
 *
 *   1. Atomic           — one concept per node; flag long monoliths
 *   2. Summary-first    — `summary` field is filled and meaningful
 *   3. Densely linked   — at least 2 edges; flag orphans / weak links
 *   4. Duplicate-free   — no near-duplicate titles or summaries
 *
 * Output: a markdown report at the path given by --out (defaults to
 *   ~/jarvis-audit-<YYYY-MM-DD>.md). Exits 0 even when issues exist —
 *   this is informational, not a CI gate.
 *
 * Usage:
 *   node scripts/karpathy-audit.mjs              # uses default DB path
 *   node scripts/karpathy-audit.mjs --out=/tmp/r.md
 *   JARVIS_DB_PATH=/path/to/jarvis.db node scripts/karpathy-audit.mjs
 */

import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// better-sqlite3 lives in mcp-server/node_modules (not the project root).
// Use a require rooted there so this script runs from anywhere.
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '..', 'mcp-server', 'package.json'));
const Database = require('better-sqlite3');

// ── Tunable thresholds ────────────────────────────────────────────────
const ATOMIC_WORD_LIMIT = 800;          // flag nodes longer than this
const ATOMIC_HEADING_LIMIT = 5;          // many headings → many concepts
const SUMMARY_MIN_CHARS = 25;            // shorter than this is trivial
const WEAK_EDGE_COUNT = 1;               // ≤ 1 incoming+outgoing = weak
const STALE_DAYS = 3;                    // give new nodes a grace period
const DUP_JACCARD_THRESHOLD = 0.55;      // title-token Jaccard similarity
// ──────────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    }),
);

const dbPath =
  process.env.JARVIS_DB_PATH ||
  path.join(homedir(), 'Library', 'Application Support', 'app.jarvis', 'jarvis.db');
const today = new Date().toISOString().slice(0, 10);
const outPath = args.out || path.join(homedir(), `jarvis-audit-${today}.md`);

const db = new Database(dbPath, { readonly: true });

const nodes = db.prepare('SELECT * FROM nodes').all();
const edges = db.prepare('SELECT source, target, label FROM edges').all();
const tagRows = db.prepare('SELECT node_id, tag FROM node_tags').all();
const tagsByNode = new Map();
for (const r of tagRows) {
  if (!tagsByNode.has(r.node_id)) tagsByNode.set(r.node_id, []);
  tagsByNode.get(r.node_id).push(r.tag);
}

const inDegree = new Map();
const outDegree = new Map();
for (const e of edges) {
  outDegree.set(e.source, (outDegree.get(e.source) ?? 0) + 1);
  inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
}

const stripHtml = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ');
const wordCount = (s) =>
  stripHtml(s).split(/\s+/).filter(Boolean).length;
const headingCount = (s) =>
  (String(s ?? '').match(/(<h[1-6]\b)|(^|\n)#{1,6}\s/g) ?? []).length;

const tokenize = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);

const jaccard = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 0 : inter / union;
};

// ── Score each node ───────────────────────────────────────────────────
const scored = nodes.map((n) => {
  const wc = wordCount(n.content);
  const hc = headingCount(n.content);
  const summary = (n.summary ?? '').trim();
  const totalEdges = (inDegree.get(n.id) ?? 0) + (outDegree.get(n.id) ?? 0);
  const ageDays = (Date.now() - new Date(n.created_at).getTime()) / 86_400_000;

  const issues = [];
  if (wc > ATOMIC_WORD_LIMIT) issues.push(`oversized (${wc} words; >${ATOMIC_WORD_LIMIT})`);
  if (hc > ATOMIC_HEADING_LIMIT) issues.push(`multi-concept (${hc} headings)`);
  if (!summary) issues.push('missing summary');
  else if (summary.length < SUMMARY_MIN_CHARS) issues.push(`trivial summary (${summary.length} chars)`);
  if (totalEdges === 0 && ageDays >= STALE_DAYS) issues.push('orphan (0 edges)');
  else if (totalEdges <= WEAK_EDGE_COUNT && ageDays >= STALE_DAYS) issues.push(`weakly linked (${totalEdges} edge)`);

  return { n, wc, hc, summary, totalEdges, ageDays, issues };
});

// ── Find near-duplicates by title token Jaccard ───────────────────────
const dupes = [];
for (let i = 0; i < scored.length; i++) {
  for (let j = i + 1; j < scored.length; j++) {
    const sim = jaccard(tokenize(scored[i].n.title), tokenize(scored[j].n.title));
    if (sim >= DUP_JACCARD_THRESHOLD) {
      dupes.push({ a: scored[i].n, b: scored[j].n, similarity: sim });
    }
  }
}
dupes.sort((a, b) => b.similarity - a.similarity);

// ── Aggregate stats ───────────────────────────────────────────────────
const total = scored.length;
const totalEdgeCount = edges.length;
const orphanCount = scored.filter((s) => s.totalEdges === 0).length;
const missingSummaryCount = scored.filter((s) => !s.summary).length;
const oversizedCount = scored.filter((s) => s.wc > ATOMIC_WORD_LIMIT).length;
const wcAvg = Math.round(scored.reduce((a, s) => a + s.wc, 0) / Math.max(1, total));
const edgesAvg = (totalEdgeCount * 2) / Math.max(1, total); // undirected per-node degree

const issuesByNode = scored.filter((s) => s.issues.length > 0);

// ── Render markdown report ────────────────────────────────────────────
const lines = [];
lines.push(`# Jarvis Karpathy Audit — ${today}`);
lines.push('');
lines.push(
  '_Read-only audit of the local Jarvis graph against four "second-brain" principles: ' +
    'atomic notes, summary-first, dense linking, and duplicate-free. No mutations are made; ' +
    'use this report to guide manual splits, summary fills, and link additions._',
);
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push(`- Nodes: **${total}**`);
lines.push(`- Edges: **${totalEdgeCount}** (avg degree per node: ${edgesAvg.toFixed(2)})`);
lines.push(`- Avg word count: **${wcAvg}**`);
lines.push(`- Orphans (0 edges, age ≥ ${STALE_DAYS}d): **${orphanCount}**`);
lines.push(`- Missing summary: **${missingSummaryCount}**`);
lines.push(`- Oversized (>${ATOMIC_WORD_LIMIT} words): **${oversizedCount}**`);
lines.push(`- Near-duplicate title pairs (Jaccard ≥ ${DUP_JACCARD_THRESHOLD}): **${dupes.length}**`);
lines.push('');

if (issuesByNode.length === 0) {
  lines.push('## Per-node issues');
  lines.push('');
  lines.push('_No nodes flagged. Nice work._');
  lines.push('');
} else {
  lines.push(`## Per-node issues (${issuesByNode.length})`);
  lines.push('');
  lines.push('| Title | Type | Words | Edges | Age (d) | Issues |');
  lines.push('| --- | --- | ---: | ---: | ---: | --- |');
  for (const s of issuesByNode.sort((a, b) => b.issues.length - a.issues.length)) {
    const titleClean = s.n.title.replace(/\|/g, '\\|');
    lines.push(
      `| ${titleClean} | ${s.n.node_type} | ${s.wc} | ${s.totalEdges} | ${Math.round(s.ageDays)} | ${s.issues.join('; ')} |`,
    );
  }
  lines.push('');
}

if (dupes.length > 0) {
  lines.push(`## Near-duplicate title pairs (${dupes.length})`);
  lines.push('');
  lines.push('| Similarity | A | B |');
  lines.push('| ---: | --- | --- |');
  for (const d of dupes) {
    lines.push(
      `| ${d.similarity.toFixed(2)} | ${d.a.title.replace(/\|/g, '\\|')} | ${d.b.title.replace(/\|/g, '\\|')} |`,
    );
  }
  lines.push('');
}

lines.push('## Suggested next moves');
lines.push('');
if (orphanCount > 0)
  lines.push(`- Add **at least 2 connections** to each of the ${orphanCount} orphan node(s). A node nobody finds is a node nobody uses.`);
if (missingSummaryCount > 0)
  lines.push(`- Fill \`summary\` (1-2 sentences, the gist) on the ${missingSummaryCount} node(s) above. \`jarvis_get_summaries\` is the cheap-context tool — empty summaries waste it.`);
if (oversizedCount > 0)
  lines.push(`- The ${oversizedCount} oversized node(s) are candidates for **splitting** into linked atomic notes.`);
if (dupes.length > 0)
  lines.push(`- The ${dupes.length} near-duplicate pair(s) may want to be **merged** or explicitly linked with \`replaces\` / \`example_of\`.`);
lines.push('');
lines.push(`_Generated by \`scripts/karpathy-audit.mjs\` from \`${dbPath}\`._`);

writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
process.stderr.write(`Wrote ${outPath} (${total} nodes, ${issuesByNode.length} flagged, ${dupes.length} near-dupes)\n`);
