/**
 * /lint — read-only audit of graph health.
 *
 * Checks:
 *   1. Orphans: nodes with zero edges
 *   2. Stale: updated_at > 90 days & status != evergreen
 *   3. Edge label distribution: flag if related_to > 30%
 *   4. Tag distribution: flag single-use tags
 *   5. Type distribution: flag if question count = 0
 *   6. Review due: review_due <= today
 */

import { useMemo } from 'react';
import { useGraphStore } from '@/hooks/useGraph';
import type { EdgeLabel, Node } from '@/types';

const STALE_DAYS = 90;

interface LintIssue {
  severity: 'warn' | 'info';
  title: string;
  detail: string;
  nodeIds?: string[];
}

function runLint(nodes: Node[], edges: { source: string; target: string; label?: EdgeLabel }[]): LintIssue[] {
  const issues: LintIssue[] = [];
  const now = Date.now();

  // 1. Orphans
  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.source);
    connected.add(e.target);
  }
  const orphans = nodes.filter((n) => !connected.has(n.id));
  if (orphans.length > 0) {
    issues.push({
      severity: 'warn',
      title: `${orphans.length} orphan node${orphans.length > 1 ? 's' : ''}`,
      detail: orphans.map((n) => n.title).join(', '),
      nodeIds: orphans.map((n) => n.id),
    });
  }

  // 2. Stale nodes
  const stale = nodes.filter((n) => {
    if (n.status === 'evergreen') return false;
    const updated = new Date(n.updated_at).getTime();
    return now - updated > STALE_DAYS * 86400000;
  });
  if (stale.length > 0) {
    issues.push({
      severity: 'warn',
      title: `${stale.length} stale node${stale.length > 1 ? 's' : ''} (>90 days)`,
      detail: stale.map((n) => n.title).join(', '),
      nodeIds: stale.map((n) => n.id),
    });
  }

  // 3. Edge label distribution
  const labelCounts: Record<string, number> = {};
  for (const e of edges) {
    const l = e.label ?? 'related_to';
    labelCounts[l] = (labelCounts[l] ?? 0) + 1;
  }
  const total = edges.length || 1;
  const relatedPct = ((labelCounts['related_to'] ?? 0) / total) * 100;
  if (relatedPct > 30) {
    issues.push({
      severity: 'warn',
      title: `"related_to" is ${relatedPct.toFixed(0)}% of edges`,
      detail: 'Consider labeling edges more specifically.',
    });
  }
  // Add full distribution as info
  const distLines = Object.entries(labelCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([l, c]) => `${l}: ${c} (${((c / total) * 100).toFixed(0)}%)`)
    .join(', ');
  issues.push({
    severity: 'info',
    title: 'Edge distribution',
    detail: distLines || 'No edges',
  });

  // 4. Tag distribution — flag single-use
  const tagCounts: Record<string, number> = {};
  for (const n of nodes) {
    for (const t of n.tags) {
      tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    }
  }
  const singleUse = Object.entries(tagCounts).filter(([, c]) => c === 1);
  if (singleUse.length > 0) {
    issues.push({
      severity: 'info',
      title: `${singleUse.length} single-use tag${singleUse.length > 1 ? 's' : ''}`,
      detail: singleUse.map(([t]) => t).join(', '),
    });
  }

  // 5. Type distribution
  const typeCounts: Record<string, number> = {};
  for (const n of nodes) {
    typeCounts[n.node_type] = (typeCounts[n.node_type] ?? 0) + 1;
  }
  if (!typeCounts['question']) {
    issues.push({
      severity: 'info',
      title: 'No question nodes',
      detail: 'Consider adding open questions to the graph.',
    });
  }
  const typeLines = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([t, c]) => `${t}: ${c}`)
    .join(', ');
  issues.push({
    severity: 'info',
    title: 'Node types',
    detail: typeLines,
  });

  // 6. Review due
  const today = new Date().toISOString().slice(0, 10);
  const due = nodes.filter((n) => n.review_due && n.review_due <= today);
  if (due.length > 0) {
    issues.push({
      severity: 'warn',
      title: `${due.length} node${due.length > 1 ? 's' : ''} due for review`,
      detail: due.map((n) => `${n.title} (${n.review_due})`).join(', '),
      nodeIds: due.map((n) => n.id),
    });
  }

  return issues;
}

interface Props {
  onClose: () => void;
}

export function LintReport({ onClose }: Props) {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectNode = useGraphStore((s) => s.selectNode);
  const flyToNode = useGraphStore((s) => s.flyToNode);

  const issues = useMemo(() => runLint(nodes, edges), [nodes, edges]);
  const warnings = issues.filter((i) => i.severity === 'warn');
  const infos = issues.filter((i) => i.severity === 'info');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-xl border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-text">/lint — Graph Health</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-elevated hover:text-text"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Summary bar */}
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>{nodes.length} nodes</span>
            <span className="text-border">·</span>
            <span>{edges.length} edges</span>
            <span className="text-border">·</span>
            <span className={warnings.length > 0 ? 'text-amber-400' : 'text-emerald-400'}>
              {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Warnings */}
          {warnings.map((issue, i) => (
            <div key={`w-${i}`} className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-amber-400 text-xs">⚠</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text">{issue.title}</p>
                  <p className="mt-0.5 text-xs text-muted break-words">{issue.detail}</p>
                  {issue.nodeIds && issue.nodeIds.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {issue.nodeIds.slice(0, 8).map((id) => {
                        const node = nodes.find((n) => n.id === id);
                        return (
                          <button
                            key={id}
                            onClick={() => {
                              selectNode(id);
                              flyToNode(id);
                              onClose();
                            }}
                            className="rounded px-2 py-0.5 text-xs bg-elevated border border-border text-accent hover:bg-border truncate max-w-[150px]"
                          >
                            {node?.title ?? id.slice(0, 8)}
                          </button>
                        );
                      })}
                      {issue.nodeIds.length > 8 && (
                        <span className="px-1 text-xs text-muted">+{issue.nodeIds.length - 8} more</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Info */}
          {infos.map((issue, i) => (
            <div key={`i-${i}`} className="rounded-lg border border-border bg-elevated/50 px-4 py-3">
              <p className="text-sm font-medium text-text">{issue.title}</p>
              <p className="mt-0.5 text-xs text-muted break-words">{issue.detail}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-elevated px-4 py-1.5 text-xs font-medium text-text hover:bg-border"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
