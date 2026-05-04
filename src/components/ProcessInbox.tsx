/**
 * /process-inbox — Find seedling orphan nodes and enrich them one at a time.
 *
 * Criteria: status='seedling' AND zero edges.
 * For each, opens IngestWizard with the node's content pre-filled so Claude
 * can suggest tags, edges, summary, etc.
 */

import { useCallback, useMemo, useState } from 'react';
import { useGraphStore } from '@/hooks/useGraph';
import { IngestWizard } from '@/components/IngestWizard';
import type { Node } from '@/types';

interface Props {
  onClose: () => void;
}

export function ProcessInbox({ onClose }: Props) {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);

  const inbox = useMemo(() => {
    const connected = new Set<string>();
    for (const e of edges) {
      connected.add(e.source);
      connected.add(e.target);
    }
    return nodes.filter(
      (n) => n.status === 'seedling' && !connected.has(n.id),
    );
  }, [nodes, edges]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [processing, setProcessing] = useState(false);

  const current = inbox[currentIdx] as Node | undefined;

  const handleItemDone = useCallback(() => {
    if (currentIdx < inbox.length - 1) {
      setCurrentIdx((i) => i + 1);
      setProcessing(false);
    } else {
      onClose();
    }
  }, [currentIdx, inbox.length, onClose]);

  // Empty inbox state
  if (inbox.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl">
          <h2 className="text-sm font-semibold text-text mb-2">/process-inbox</h2>
          <p className="text-xs text-muted mb-4">
            No seedling orphan nodes found. All nodes either have edges or are past seedling status.
          </p>
          <div className="flex justify-end">
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

  // If actively processing one item, show IngestWizard
  if (processing && current) {
    return (
      <IngestWizard
        onClose={handleItemDone}
        prefill={{ node: current, content: `${current.title}\n\n${current.content}` }}
      />
    );
  }

  // Queue view
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-text">
            /process-inbox — {inbox.length} seedling orphan{inbox.length !== 1 ? 's' : ''}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-elevated hover:text-text">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {inbox.map((node, i) => (
            <div
              key={node.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                i === currentIdx
                  ? 'border-accent/30 bg-accent/5'
                  : i < currentIdx
                    ? 'border-border bg-elevated/50 opacity-50'
                    : 'border-border bg-elevated/30'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text truncate">{node.title}</p>
                <p className="text-xs text-muted truncate">
                  {node.tags.join(', ') || 'no tags'}
                </p>
              </div>
              {i === currentIdx && (
                <button
                  onClick={() => setProcessing(true)}
                  className="shrink-0 rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white"
                >
                  Process
                </button>
              )}
              {i < currentIdx && (
                <span className="text-xs text-emerald-400">Done</span>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-border px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-muted">
            {currentIdx + 1} of {inbox.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (currentIdx < inbox.length - 1) setCurrentIdx((i) => i + 1);
                else onClose();
              }}
              className="rounded-lg bg-elevated px-4 py-1.5 text-xs font-medium text-text hover:bg-border"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
