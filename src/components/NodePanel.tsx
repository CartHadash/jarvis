/**
 * NodePanel — slides in from the right when a node is selected.
 *
 * v2 additions:
 *   - summary callout rendered above the body
 *   - node_type / status / confidence badges in header
 *   - connections grouped by edge label
 *   - dedicated summary input, type/status/confidence dropdowns
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Confidence, EdgeLabel, Node, NodeStatus, NodeType } from '@/types';
import { isTauri, useGraphStore } from '@/hooks/useGraph';
import {
  dbAddEdge,
  dbDeleteNode,
  dbExportNodeMarkdown,
  dbRemoveEdge,
  dbUpdateNode,
} from '@/hooks/useDatabase';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { ConnectionSearch } from '@/components/ConnectionSearch';
import { MiniGraph } from '@/components/MiniGraph';
import { NodeEditor } from '@/components/NodeEditor';

// ─── Constants ────────────────────────────────────────────────────────────

const NODE_TYPES: NodeType[] = ['concept', 'source', 'goal', 'decision', 'question', 'person', 'event'];
const STATUSES: NodeStatus[] = ['seedling', 'growing', 'evergreen', 'stale'];
const CONFIDENCES: (Confidence | '')[] = ['', 'low', 'medium', 'high'];

const STATUS_COLORS: Record<NodeStatus, string> = {
  seedling: 'bg-lime-600/80',
  growing: 'bg-amber-600/80',
  evergreen: 'bg-emerald-600/80',
  stale: 'bg-zinc-600/80',
};

const TYPE_LABELS: Record<NodeType, string> = {
  concept: 'Concept',
  source: 'Source',
  goal: 'Goal',
  decision: 'Decision',
  question: 'Question',
  person: 'Person',
  event: 'Event',
};

const EDGE_LABEL_DISPLAY: Record<string, string> = {
  supports: 'Supports',
  contradicts: 'Contradicts',
  example_of: 'Example of',
  prerequisite_for: 'Prerequisite for',
  part_of: 'Part of',
  related_to: 'Related to',
  inspired_by: 'Inspired by',
  replaces: 'Replaces',
};

// ─── Component ────────────────────────────────────────────────────────────

export function NodePanel() {
  const selectedId = useGraphStore((s) => s.selectedNodeId);
  const selectNode = useGraphStore((s) => s.selectNode);
  const nodes = useGraphStore((s) => s.nodes);
  const tagColors = useGraphStore((s) => s.tagColors);
  const upsertNode = useGraphStore((s) => s.upsertNode);
  const removeNode = useGraphStore((s) => s.removeNode);
  const upsertEdge = useGraphStore((s) => s.upsertEdge);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const edges = useGraphStore((s) => s.edges);
  const flyToNode = useGraphStore((s) => s.flyToNode);

  const node = selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null;
  const [mounted, setMounted] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [exportStatus, setExportStatus] = useState<
    { kind: 'success' | 'error'; message: string } | null
  >(null);

  useEffect(() => {
    if (!exportStatus) return;
    const t = window.setTimeout(() => setExportStatus(null), 4000);
    return () => window.clearTimeout(t);
  }, [exportStatus]);
  const closeTimer = useRef<number | null>(null);

  const connectedSet = useMemo(
    () => new Set(node?.connections ?? []),
    [node?.connections],
  );

  // ── Slide animation ─────────────────────────────────────────────────
  useEffect(() => {
    if (node) {
      if (closeTimer.current) {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      requestAnimationFrame(() => setMounted(true));
    } else if (mounted) {
      setMounted(false);
      closeTimer.current = window.setTimeout(() => {
        closeTimer.current = null;
      }, 250);
    }
  }, [node, mounted]);

  useEffect(() => {
    setConfirmingDelete(false);
    setShowConnectDialog(false);
  }, [selectedId]);

  // ── Debounced save helpers ──────────────────────────────────────────
  const titleSave = useDebouncedSave<string>(async (newTitle) => {
    if (!node) return;
    if (newTitle === node.title) return;
    if (!isTauri()) {
      upsertNode({ ...node, title: newTitle, updated_at: new Date().toISOString() });
      return;
    }
    try {
      const updated = await dbUpdateNode({ id: node.id, title: newTitle });
      upsertNode({ ...updated, connections: node.connections });
    } catch (err) {
      console.error('[jarvis] save title failed', err);
    }
  });

  const contentSave = useDebouncedSave<string>(async (html) => {
    if (!node) return;
    if (html === node.content) return;
    if (!isTauri()) {
      upsertNode({ ...node, content: html, updated_at: new Date().toISOString() });
      return;
    }
    try {
      const updated = await dbUpdateNode({ id: node.id, content: html });
      upsertNode({ ...updated, connections: node.connections });
    } catch (err) {
      console.error('[jarvis] save content failed', err);
    }
  });

  const summarySave = useDebouncedSave<string>(async (newSummary) => {
    if (!node) return;
    const val = newSummary.trim() || null;
    if (val === (node.summary ?? null)) return;
    if (!isTauri()) {
      upsertNode({ ...node, summary: val ?? undefined, updated_at: new Date().toISOString() });
      return;
    }
    try {
      const updated = await dbUpdateNode({ id: node.id, summary: val });
      upsertNode({ ...updated, connections: node.connections });
    } catch (err) {
      console.error('[jarvis] save summary failed', err);
    }
  });

  if (!node) return null;

  const created = formatDate(node.created_at);
  const updated = formatDate(node.updated_at);

  // ── Edges grouped by label ──────────────────────────────────────────
  // Outgoing edges (this node points OUT) drive the "Connections" panel.
  // Incoming edges (other nodes point AT us) drive the "Backlinks" panel.
  const nodeEdges = edges.filter(
    (e) => e.source === node.id || e.target === node.id,
  );
  const edgesByLabel = new Map<string, { otherId: string; edgeId: string; direction: 'out' | 'in' }[]>();
  const backlinksByLabel = new Map<string, { otherId: string; edgeId: string }[]>();
  for (const e of nodeEdges) {
    const label = e.label ?? 'related_to';
    if (e.source === node.id) {
      if (!edgesByLabel.has(label)) edgesByLabel.set(label, []);
      edgesByLabel.get(label)!.push({ otherId: e.target, edgeId: e.id, direction: 'out' });
    } else {
      if (!backlinksByLabel.has(label)) backlinksByLabel.set(label, []);
      backlinksByLabel.get(label)!.push({ otherId: e.source, edgeId: e.id });
    }
  }
  const outgoingCount = Array.from(edgesByLabel.values()).reduce((a, v) => a + v.length, 0);
  const backlinkCount = Array.from(backlinksByLabel.values()).reduce((a, v) => a + v.length, 0);

  // ── Mutation handlers ───────────────────────────────────────────────
  const handleFieldChange = async (field: string, value: string | null) => {
    if (!node) return;
    const patch: Record<string, unknown> = { id: node.id, [field]: value };
    if (!isTauri()) {
      upsertNode({ ...node, [field]: value, updated_at: new Date().toISOString() } as Node);
      return;
    }
    try {
      const updated = await dbUpdateNode(patch as unknown as Parameters<typeof dbUpdateNode>[0]);
      upsertNode({ ...updated, connections: node.connections });
    } catch (err) {
      console.error(`[jarvis] save ${field} failed`, err);
    }
  };

  const handleAddConnection = async (targetId: string, label?: EdgeLabel) => {
    setShowConnectDialog(false);
    if (!isTauri()) {
      upsertEdge({
        id: `local_${Date.now()}`,
        source: node.id,
        target: targetId,
        label,
        created_at: new Date().toISOString(),
        created_by: 'user',
      });
      return;
    }
    try {
      const edge = await dbAddEdge({ source: node.id, target: targetId, label, createdBy: 'user' });
      upsertEdge(edge);
    } catch (err) {
      console.error('[jarvis] add edge failed', err);
    }
  };

  const handleRemoveConnection = async (otherId: string) => {
    const edge = edges.find(
      (e) =>
        (e.source === node.id && e.target === otherId) ||
        (e.source === otherId && e.target === node.id),
    );
    if (!edge) return;
    if (!isTauri()) {
      removeEdge(edge.id);
      return;
    }
    try {
      await dbRemoveEdge(edge.source, edge.target);
      removeEdge(edge.id);
    } catch (err) {
      console.error('[jarvis] remove edge failed', err);
    }
  };

  const handleDelete = async () => {
    if (!isTauri()) {
      removeNode(node.id);
      selectNode(null);
      return;
    }
    try {
      await dbDeleteNode(node.id);
      removeNode(node.id);
      selectNode(null);
    } catch (err) {
      console.error('[jarvis] delete failed', err);
    }
  };

  const handleMentionPick = async (picked: { id: string; title: string }) => {
    if (picked.id === node.id) return;
    if (connectedSet.has(picked.id)) return;
    await handleAddConnection(picked.id);
  };

  return (
    <aside
      aria-label="Node details"
      className={`absolute right-0 top-0 z-10 flex h-full w-[400px] flex-col overflow-hidden border-l border-border bg-surface transition-all duration-[250ms] ease-cubic-out ${
        mounted ? 'translate-x-0 opacity-100' : 'translate-x-10 opacity-0'
      }`}
    >
      {/* ── Header: badges + close ─────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Node type badge */}
          <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
            {TYPE_LABELS[node.node_type] ?? node.node_type}
          </span>
          {/* Status badge */}
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${STATUS_COLORS[node.status] ?? 'bg-zinc-600/80'}`}>
            {node.status}
          </span>
          {/* Confidence badge */}
          {node.confidence && (
            <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-muted">
              {node.confidence} confidence
            </span>
          )}
          {/* Tags */}
          {node.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: tagColors[tag] ?? '#6b7280' }}
            >
              {tag}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => selectNode(null)}
          aria-label="Close node details"
          className="rounded-md px-2 py-0.5 text-muted hover:bg-elevated hover:text-text"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* ── Title ─────────────────────────────────────────────────── */}
        <input
          type="text"
          defaultValue={node.title}
          key={`title-${node.id}`}
          onChange={(e) => titleSave.schedule(e.target.value)}
          onBlur={() => titleSave.flush()}
          className="w-full bg-transparent px-4 pt-4 text-lg font-semibold leading-snug text-text focus:outline-none"
        />

        {/* ── Summary callout ───────────────────────────────────────── */}
        {node.summary && (
          <div className="mx-4 mt-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2.5">
            <p className="text-[13px] leading-relaxed text-text/80">
              {node.summary}
            </p>
          </div>
        )}

        {/* ── Summary input ─────────────────────────────────────────── */}
        <div className="px-4 pt-3">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-muted">
            Summary
          </label>
          <textarea
            key={`summary-${node.id}`}
            defaultValue={node.summary ?? ''}
            onChange={(e) => summarySave.schedule(e.target.value)}
            onBlur={() => summarySave.flush()}
            maxLength={200}
            rows={2}
            placeholder="One-sentence description..."
            className="w-full resize-none rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[12px] text-text placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>

        {/* ── Type / Status / Confidence dropdowns ──────────────────── */}
        <div className="grid grid-cols-3 gap-2 px-4 pt-2">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-muted">
              Type
            </label>
            <select
              key={`type-${node.id}`}
              value={node.node_type}
              onChange={(e) => handleFieldChange('node_type', e.target.value)}
              className="w-full rounded-md border border-border bg-elevated px-1.5 py-1 text-[11px] text-text focus:border-accent focus:outline-none"
            >
              {NODE_TYPES.map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-muted">
              Status
            </label>
            <select
              key={`status-${node.id}`}
              value={node.status}
              onChange={(e) => handleFieldChange('status', e.target.value)}
              className="w-full rounded-md border border-border bg-elevated px-1.5 py-1 text-[11px] text-text focus:border-accent focus:outline-none"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-muted">
              Confidence
            </label>
            <select
              key={`conf-${node.id}`}
              value={node.confidence ?? ''}
              onChange={(e) => handleFieldChange('confidence', e.target.value || null)}
              className="w-full rounded-md border border-border bg-elevated px-1.5 py-1 text-[11px] text-text focus:border-accent focus:outline-none"
            >
              {CONFIDENCES.map((c) => (
                <option key={c} value={c}>{c || '—'}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Tiptap content editor ─────────────────────────────────── */}
        <div className="px-4 pb-4 pt-3">
          <NodeEditor
            nodeId={node.id}
            initialContent={node.content}
            onChange={(html) => contentSave.schedule(html)}
            onMention={handleMentionPick}
          />
        </div>

        {/* ── Connections (grouped by label) ────────────────────────── */}
        <section className="border-t border-border px-4 py-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[10px] font-medium uppercase tracking-widest text-muted">
              Connections ({outgoingCount})
            </h2>
            <button
              type="button"
              onClick={() => setShowConnectDialog(true)}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-surface/50 px-2 py-1 text-xs font-medium text-text/90 transition-colors duration-150 ease-cubic-out hover:border-accent/60 hover:bg-surface hover:text-text active:translate-y-px"
              title="Connect this node to another"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add
            </button>
          </div>

          {outgoingCount === 0 ? (
            <p className="text-[12px] text-muted">
              No outgoing connections yet. Use <kbd className="font-mono">@</kbd> in the
              editor or click <em>Add</em>.
            </p>
          ) : (
            <div className="space-y-3">
              {Array.from(edgesByLabel.entries()).map(([label, items]) => (
                <div key={label}>
                  <h3 className="mb-1 text-[10px] font-medium text-muted">
                    {EDGE_LABEL_DISPLAY[label] ?? label} ({items.length})
                  </h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {items.map(({ otherId }) => {
                      const c = nodes.find((n) => n.id === otherId);
                      if (!c) return null;
                      const cColor = (c.tags.length > 0 ? tagColors[c.tags[0]] : undefined) ?? '#6b7280';
                      return (
                        <li key={otherId} className="group">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated text-[11px] text-text hover:border-accent">
                            <button
                              type="button"
                              onClick={() => {
                                selectNode(c.id);
                                flyToNode(c.id);
                              }}
                              className="flex items-center gap-1.5 py-1 pl-2.5"
                            >
                              <span
                                aria-hidden
                                className="inline-block h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: cColor }}
                              />
                              <span className="max-w-[140px] truncate">{c.title}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveConnection(c.id)}
                              aria-label={`Disconnect from ${c.title}`}
                              className="px-1.5 py-1 pr-2 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-text"
                            >
                              ✕
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Backlinks (incoming edges) ─────────────────────────────── */}
        {backlinkCount > 0 && (
          <section className="border-t border-border px-4 py-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="20" y1="12" x2="4" y2="12" />
                <polyline points="10 6 4 12 10 18" />
              </svg>
              Backlinks ({backlinkCount})
            </h2>
            <div className="space-y-3">
              {Array.from(backlinksByLabel.entries()).map(([label, items]) => (
                <div key={`bl-${label}`}>
                  <h3 className="mb-1 text-[10px] font-medium text-muted">
                    {EDGE_LABEL_DISPLAY[label] ?? label} ({items.length})
                  </h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {items.map(({ otherId }) => {
                      const c = nodes.find((n) => n.id === otherId);
                      if (!c) return null;
                      const cColor = (c.tags.length > 0 ? tagColors[c.tags[0]] : undefined) ?? '#6b7280';
                      return (
                        <li key={`bl-${otherId}`}>
                          <button
                            type="button"
                            onClick={() => {
                              selectNode(c.id);
                              flyToNode(c.id);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated/60 px-2.5 py-1 text-[11px] text-text transition-colors hover:border-accent"
                            title={`${c.title} → this node (${EDGE_LABEL_DISPLAY[label] ?? label})`}
                          >
                            <span
                              aria-hidden
                              className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: cColor }}
                            />
                            <span className="max-w-[140px] truncate">{c.title}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── MiniGraph ─────────────────────────────────────────────── */}
        {nodeEdges.length > 0 && (
          <section className="border-t border-border px-4 py-4">
            <h2 className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted">
              Local view
            </h2>
            <MiniGraph centerNode={node} />
          </section>
        )}

        {/* ── Metadata + Delete ─────────────────────────────────────── */}
        <section className="border-t border-border px-4 py-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px] text-muted">
            <dt>ID</dt>
            <dd className="font-mono">{node.id}</dd>
            <dt>Created</dt>
            <dd>{created}</dd>
            <dt>Updated</dt>
            <dd>{updated}</dd>
            {node.source_url && (
              <>
                <dt>Source</dt>
                <dd className="truncate">
                  <a href={node.source_url} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
                    {node.source_url}
                  </a>
                </dd>
              </>
            )}
            {node.review_due && (
              <>
                <dt>Review due</dt>
                <dd>{formatDate(node.review_due)}</dd>
              </>
            )}
          </dl>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/40 pt-3">
            <button
              type="button"
              onClick={async () => {
                if (!isTauri() || !node) return;
                try {
                  const path = await dbExportNodeMarkdown(node.id);
                  const filename = path.split('/').pop() ?? path;
                  setExportStatus({ kind: 'success', message: `Saved ${filename}` });
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  console.error('[jarvis] export failed', err);
                  setExportStatus({ kind: 'error', message: `Export failed: ${msg}` });
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-surface/50 px-2.5 py-1.5 text-xs font-medium text-text/90 transition-colors duration-150 ease-cubic-out hover:border-accent/60 hover:bg-surface hover:text-text active:translate-y-px"
              title="Save this node as a markdown file and reveal in Finder"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export .md
            </button>
            {confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Delete this node?</span>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-md border border-border/60 bg-surface/50 px-2.5 py-1.5 text-xs font-medium text-text/90 transition-colors hover:bg-surface"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-500 active:translate-y-px"
                >
                  Delete
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 text-xs font-medium text-red-400 transition-colors duration-150 ease-cubic-out hover:border-red-500/60 hover:bg-red-500/10 hover:text-red-300 active:translate-y-px"
                title="Delete this node permanently"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
                Delete
              </button>
            )}
          </div>
          {exportStatus && (
            <div
              className={`mt-2 rounded-md border px-2 py-1.5 text-[11px] ${
                exportStatus.kind === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-red-500/40 bg-red-500/10 text-red-300'
              }`}
              role="status"
            >
              {exportStatus.message}
            </div>
          )}
        </section>
      </div>

      {showConnectDialog && (
        <ConnectionSearch
          currentNodeId={node.id}
          excludeIds={connectedSet}
          onConfirm={handleAddConnection}
          onClose={() => setShowConnectDialog(false)}
        />
      )}
    </aside>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
