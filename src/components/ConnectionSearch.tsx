/**
 * ConnectionSearch — modal-ish dialog for picking another node to
 * connect the current one to. Used by NodePanel's "Add connection"
 * button. Includes an optional relationship label.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { EdgeLabel } from '@/types';
import { useGraphStore } from '@/hooks/useGraph';

interface Props {
  currentNodeId: string;
  excludeIds: Set<string>;
  onConfirm: (targetId: string, label?: EdgeLabel) => void;
  onClose: () => void;
}

export function ConnectionSearch({ currentNodeId, excludeIds, onConfirm, onClose }: Props) {
  const nodes = useGraphStore((s) => s.nodes);
  const tagColors = useGraphStore((s) => s.tagColors);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const [label, setLabel] = useState('');

  useEffect(() => inputRef.current?.focus(), []);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nodes
      .filter((n) => n.id !== currentNodeId && !excludeIds.has(n.id))
      .filter((n) => !q || n.title.toLowerCase().includes(q))
      .slice(0, 12);
  }, [nodes, currentNodeId, excludeIds, query]);

  return (
    <div
      className="absolute inset-0 z-20 flex items-start justify-center bg-bg/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-16 w-[340px] overflow-hidden rounded-lg border border-border bg-elevated shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-widest text-muted">
          Add connection
        </div>

        <input
          ref={inputRef}
          type="search"
          placeholder="Search a node…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full border-b border-border bg-transparent px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none"
        />

        <ul className="max-h-56 overflow-y-auto">
          {candidates.length === 0 && (
            <li className="px-3 py-3 text-center text-xs text-muted">
              No matches.
            </li>
          )}
          {candidates.map((n) => {
            const color = (n.tags.length > 0 ? tagColors[n.tags[0]] : undefined) ?? '#6b7280';
            const active = target === n.id;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => setTarget(n.id)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                    active ? 'bg-bg/60 text-text' : 'text-muted hover:text-text'
                  }`}
                >
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate">{n.title}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-border p-3">
          <input
            type="text"
            placeholder="Relationship label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="mb-2 w-full rounded-md border border-border bg-bg px-2 py-1 text-xs text-text placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2.5 py-1 text-xs text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!target}
              onClick={() => target && onConfirm(target, (label.trim() || undefined) as EdgeLabel | undefined)}
              className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
