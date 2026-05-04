/**
 * /ingest — Import external content into the graph.
 *
 * Flow:
 *   1. User enters a URL or pastes text
 *   2. Fetch URL content (if URL)
 *   3. Search existing nodes for related context (2-3 queries)
 *   4. Call Claude to draft: title, summary, content, tags, type, edges, contradictions
 *   5. Preview UI: user can edit all fields, toggle edges, review contradictions
 *   6. Approve → create node + edges in DB
 */

import { useCallback, useRef, useState } from 'react';
import { useGraphStore } from '@/hooks/useGraph';
import {
  dbCallClaude,
  dbCreateNode,
  dbAddEdge,
  dbFetchUrl,
  dbSearchNodes,
} from '@/hooks/useDatabase';
import type { EdgeLabel, NodeType, NodeStatus, Confidence, Node } from '@/types';

// ─── Types ─────────────────────────────────────────────────────────────

interface DraftEdge {
  targetId: string;
  targetTitle: string;
  label: EdgeLabel;
  enabled: boolean;
}

interface Contradiction {
  nodeId: string;
  nodeTitle: string;
  reason: string;
}

interface Draft {
  title: string;
  summary: string;
  content: string;
  tags: string[];
  node_type: NodeType;
  status: NodeStatus;
  confidence: Confidence;
  edges: DraftEdge[];
  contradictions: Contradiction[];
  source_url?: string;
}

type Step = 'input' | 'processing' | 'preview' | 'done' | 'error';

// ─── Claude prompt ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Jarvis, a knowledge graph assistant. You receive some content (from a URL or pasted text) plus context about existing nodes in the user's graph. Your job is to draft a new node and suggest edges.

Respond with ONLY valid JSON (no markdown fences). Schema:
{
  "title": "string — concise title",
  "summary": "string — 1-2 sentence summary",
  "content": "string — the key ideas in markdown, not a copy of the source",
  "tags": ["string — existing tags or new ones, use namespace/ format like domain/finance"],
  "node_type": "concept|source|goal|decision|question|person|event",
  "confidence": "low|medium|high",
  "edges": [{"targetId": "string", "label": "supports|contradicts|example_of|prerequisite_for|part_of|related_to|inspired_by|replaces", "reason": "why this edge"}],
  "contradictions": [{"nodeId": "string", "reason": "what specifically is contradicted"}]
}

Rules:
- Only suggest edges to nodes that were provided in the context
- Use specific edge labels, avoid "related_to" when a more precise label fits
- contradictions array should include any nodes whose claims conflict with this content
- Tags should reuse existing tags when they fit; use namespace/name format`;

function buildUserMessage(
  sourceContent: string,
  relatedNodes: { id: string; title: string; summary?: string; tags: string[] }[],
  sourceUrl?: string,
): string {
  const parts: string[] = [];

  if (sourceUrl) parts.push(`Source URL: ${sourceUrl}\n`);
  parts.push(`Content to ingest:\n${sourceContent.slice(0, 8000)}\n`);

  if (relatedNodes.length > 0) {
    parts.push(`\nExisting related nodes in the graph:`);
    for (const n of relatedNodes) {
      parts.push(`- [${n.id}] "${n.title}" (tags: ${n.tags.join(', ')})${n.summary ? ` — ${n.summary}` : ''}`);
    }
  }

  return parts.join('\n');
}

// ─── Component ─────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  /** Pre-fill with a seedling node for /process-inbox */
  prefill?: { node: Node; content: string };
}

export function IngestWizard({ onClose, prefill }: Props) {
  const [step, setStep] = useState<Step>(prefill ? 'processing' : 'input');
  const [input, setInput] = useState(prefill?.content ?? '');
  const [errorMsg, setErrorMsg] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const upsertNode = useGraphStore((s) => s.upsertNode);
  const upsertEdge = useGraphStore((s) => s.upsertEdge);
  const selectNode = useGraphStore((s) => s.selectNode);
  const flyToNode = useGraphStore((s) => s.flyToNode);

  // Start processing on mount if prefill is provided
  const hasStarted = useRef(false);
  if (prefill && !hasStarted.current) {
    hasStarted.current = true;
    // Use setTimeout to avoid calling async in render
    setTimeout(() => processContent(prefill.content, undefined), 0);
  }

  const processContent = useCallback(async (content: string, sourceUrl?: string) => {
    setStep('processing');
    try {
      // Step 1: fetch URL if needed
      let text = content;
      if (sourceUrl) {
        text = await dbFetchUrl(sourceUrl);
        // Strip HTML tags for a rough readability extraction
        text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        text = text.replace(/<[^>]+>/g, ' ');
        text = text.replace(/\s+/g, ' ').trim();
      }

      // Step 2: search existing nodes for context (2-3 queries)
      // Extract key terms from first ~200 chars for search
      const snippet = text.slice(0, 200);
      const words = snippet.split(/\s+/).filter((w) => w.length > 4).slice(0, 5);
      const searchQueries = [
        words.slice(0, 3).join(' '),
        words.slice(2, 5).join(' '),
      ].filter(Boolean);

      const searchResults = new Map<string, Node>();
      for (const q of searchQueries) {
        if (!q) continue;
        const results = await dbSearchNodes(q, 10);
        for (const n of results) searchResults.set(n.id, n);
      }

      const related = Array.from(searchResults.values()).slice(0, 15).map((n) => ({
        id: n.id,
        title: n.title,
        summary: n.summary,
        tags: n.tags,
      }));

      // Step 3: call Claude
      const userMsg = buildUserMessage(text, related, sourceUrl);
      const response = await dbCallClaude(SYSTEM_PROMPT, userMsg);

      // Parse JSON from response (handle possible markdown fences)
      let json = response.trim();
      if (json.startsWith('```')) {
        json = json.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      const parsed = JSON.parse(json);

      // Build draft
      const draftEdges: DraftEdge[] = (parsed.edges ?? []).map((e: { targetId: string; label: string }) => {
        const targetNode = searchResults.get(e.targetId);
        return {
          targetId: e.targetId,
          targetTitle: targetNode?.title ?? e.targetId.slice(0, 8),
          label: e.label as EdgeLabel,
          enabled: true,
        };
      });

      const contradictions: Contradiction[] = (parsed.contradictions ?? []).map(
        (c: { nodeId: string; reason: string }) => {
          const cNode = searchResults.get(c.nodeId);
          return {
            nodeId: c.nodeId,
            nodeTitle: cNode?.title ?? c.nodeId.slice(0, 8),
            reason: c.reason,
          };
        },
      );

      setDraft({
        title: parsed.title ?? 'Untitled',
        summary: parsed.summary ?? '',
        content: parsed.content ?? text.slice(0, 2000),
        tags: parsed.tags ?? [],
        node_type: parsed.node_type ?? 'concept',
        status: 'seedling' as NodeStatus,
        confidence: parsed.confidence ?? 'medium',
        edges: draftEdges,
        contradictions,
        source_url: sourceUrl,
      });
      setStep('preview');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  }, []);

  const handleSubmitInput = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Detect URL
    const isUrl = /^https?:\/\//i.test(trimmed);
    if (isUrl) {
      processContent('', trimmed);
    } else {
      processContent(trimmed, undefined);
    }
  }, [input, processContent]);

  const handleApprove = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    try {
      // If prefill, update the existing node instead of creating new
      const node = await dbCreateNode({
        title: draft.title,
        content: draft.content,
        tags: draft.tags,
        node_type: draft.node_type,
        status: draft.status,
        summary: draft.summary,
        confidence: draft.confidence,
        source_url: draft.source_url,
      });

      upsertNode(node);

      // Create enabled edges
      for (const edge of draft.edges) {
        if (!edge.enabled) continue;
        const created = await dbAddEdge({
          source: node.id,
          target: edge.targetId,
          label: edge.label,
          createdBy: 'claude',
        });
        upsertEdge(created);
      }

      // Add contradicts edges
      for (const c of draft.contradictions) {
        const created = await dbAddEdge({
          source: node.id,
          target: c.nodeId,
          label: 'contradicts',
          createdBy: 'claude',
        });
        upsertEdge(created);
      }

      selectNode(node.id);
      flyToNode(node.id);
      setStep('done');
      setTimeout(onClose, 600);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStep('error');
    } finally {
      setSaving(false);
    }
  }, [draft, upsertNode, upsertEdge, selectNode, flyToNode, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-text">
            {prefill ? `/process-inbox — ${prefill.node.title}` : '/ingest — Import Content'}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-elevated hover:text-text">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* INPUT STEP */}
          {step === 'input' && (
            <div className="space-y-4">
              <p className="text-xs text-muted">
                Paste a URL or text. Jarvis will fetch the content, find related nodes, and draft a new node with edges.
              </p>
              <textarea
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="https://example.com/article or paste text..."
                rows={6}
                className="w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSubmitInput();
                  }
                }}
              />
              <div className="flex justify-end">
                <button
                  onClick={handleSubmitInput}
                  disabled={!input.trim()}
                  className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                >
                  Ingest
                </button>
              </div>
            </div>
          )}

          {/* PROCESSING STEP */}
          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="text-xs text-muted">Fetching content and consulting Claude...</p>
            </div>
          )}

          {/* ERROR STEP */}
          {step === 'error' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
                <p className="text-sm font-medium text-red-400">Error</p>
                <p className="mt-1 text-xs text-muted">{errorMsg}</p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setStep('input')}
                  className="rounded-lg bg-elevated px-4 py-1.5 text-xs font-medium text-text hover:bg-border"
                >
                  Try Again
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg bg-elevated px-4 py-1.5 text-xs font-medium text-text hover:bg-border"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* PREVIEW STEP */}
          {step === 'preview' && draft && (
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="mb-1 block text-xs text-muted">Title</label>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className="w-full rounded-lg border border-border bg-elevated px-3 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
                />
              </div>

              {/* Summary */}
              <div>
                <label className="mb-1 block text-xs text-muted">Summary</label>
                <textarea
                  value={draft.summary}
                  onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-elevated px-3 py-1.5 text-sm text-text focus:border-accent focus:outline-none resize-none"
                />
              </div>

              {/* Type + Confidence row */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-muted">Type</label>
                  <select
                    value={draft.node_type}
                    onChange={(e) => setDraft({ ...draft, node_type: e.target.value as NodeType })}
                    className="w-full rounded-lg border border-border bg-elevated px-2 py-1.5 text-xs text-text"
                  >
                    {['concept', 'source', 'goal', 'decision', 'question', 'person', 'event'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-muted">Confidence</label>
                  <select
                    value={draft.confidence}
                    onChange={(e) => setDraft({ ...draft, confidence: e.target.value as Confidence })}
                    className="w-full rounded-lg border border-border bg-elevated px-2 py-1.5 text-xs text-text"
                  >
                    {['low', 'medium', 'high'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="mb-1 block text-xs text-muted">Tags</label>
                <input
                  value={draft.tags.join(', ')}
                  onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
                  className="w-full rounded-lg border border-border bg-elevated px-3 py-1.5 text-xs text-text focus:border-accent focus:outline-none"
                  placeholder="domain/finance, area/goals"
                />
              </div>

              {/* Content preview */}
              <div>
                <label className="mb-1 block text-xs text-muted">Content</label>
                <textarea
                  value={draft.content}
                  onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                  rows={5}
                  className="w-full rounded-lg border border-border bg-elevated px-3 py-1.5 text-xs text-text focus:border-accent focus:outline-none resize-y font-mono"
                />
              </div>

              {/* Edges checklist */}
              {draft.edges.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs text-muted">
                    Suggested edges ({draft.edges.filter((e) => e.enabled).length}/{draft.edges.length})
                  </label>
                  <div className="space-y-1 rounded-lg border border-border bg-elevated p-2">
                    {draft.edges.map((edge, i) => (
                      <label key={i} className="flex items-center gap-2 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={edge.enabled}
                          onChange={() => {
                            const next = [...draft.edges];
                            next[i] = { ...next[i], enabled: !next[i].enabled };
                            setDraft({ ...draft, edges: next });
                          }}
                          className="accent-accent"
                        />
                        <span className="text-accent">{edge.label}</span>
                        <span className="text-muted">→</span>
                        <span className="text-text truncate">{edge.targetTitle}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Contradictions */}
              {draft.contradictions.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs text-muted">Contradictions found</label>
                  <div className="space-y-1 rounded-lg border border-red-500/20 bg-red-500/5 p-2">
                    {draft.contradictions.map((c, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-medium text-red-400">{c.nodeTitle}</span>
                        <span className="text-muted ml-1">— {c.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DONE STEP */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <span className="text-2xl">✓</span>
              <p className="text-sm text-text">Node created!</p>
            </div>
          )}
        </div>

        {/* Footer — only on preview */}
        {step === 'preview' && (
          <div className="border-t border-border px-5 py-3 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-lg bg-elevated px-4 py-1.5 text-xs font-medium text-text hover:bg-border"
            >
              Cancel
            </button>
            <button
              onClick={handleApprove}
              disabled={saving}
              className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Approve & Create'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
