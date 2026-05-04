/**
 * GraphFilters — floating filter panel over the graph view.
 *
 * Toggles: node type, edge label, status. Plus a re-layout button.
 * All filters apply live via the Zustand store; the Graph/GraphCanvas
 * components subscribe and dim/show accordingly.
 */

import { useState } from 'react';
import { useGraphStore } from '@/hooks/useGraph';

const NODE_TYPES: { key: string; label: string; color: string }[] = [
  { key: 'concept', label: 'Concept', color: '#3b82f6' },
  { key: 'source', label: 'Source', color: '#6b7280' },
  { key: 'goal', label: 'Goal', color: '#f59e0b' },
  { key: 'decision', label: 'Decision', color: '#a855f7' },
  { key: 'question', label: 'Question', color: '#14b8a6' },
  { key: 'person', label: 'Person', color: '#22c55e' },
  { key: 'event', label: 'Event', color: '#f97316' },
];

const EDGE_LABELS: { key: string; label: string; color: string }[] = [
  { key: 'supports', label: 'Supports', color: '#22c55e' },
  { key: 'contradicts', label: 'Contradicts', color: '#ef4444' },
  { key: 'example_of', label: 'Example of', color: '#3b82f6' },
  { key: 'prerequisite_for', label: 'Prereq for', color: '#f59e0b' },
  { key: 'part_of', label: 'Part of', color: '#6366f1' },
  { key: 'related_to', label: 'Related', color: '#9ca3af' },
  { key: 'inspired_by', label: 'Inspired by', color: '#a855f7' },
  { key: 'replaces', label: 'Replaces', color: '#f97316' },
];

const STATUSES: { key: string; label: string; color: string }[] = [
  { key: 'seedling', label: 'Seedling', color: '#84cc16' },
  { key: 'growing', label: 'Growing', color: '#f59e0b' },
  { key: 'evergreen', label: 'Evergreen', color: '#10b981' },
  { key: 'stale', label: 'Stale', color: '#6b7280' },
];

export function GraphFilters() {
  const [open, setOpen] = useState(false);

  const typeFilter = useGraphStore((s) => s.typeFilter);
  const edgeLabelFilter = useGraphStore((s) => s.edgeLabelFilter);
  const statusFilter = useGraphStore((s) => s.statusFilter);
  const toggleType = useGraphStore((s) => s.toggleTypeFilter);
  const toggleEdgeLabel = useGraphStore((s) => s.toggleEdgeLabelFilter);
  const toggleStatus = useGraphStore((s) => s.toggleStatusFilter);
  const clearAll = useGraphStore((s) => s.clearGraphFilters);
  const relayout = useGraphStore((s) => s.triggerRelayout);

  const hasFilters = typeFilter.size > 0 || edgeLabelFilter.size > 0 || statusFilter.size > 0;

  if (!open) {
    return (
      <div className="absolute right-3 top-3 z-10 flex gap-1.5">
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-border bg-surface/90 px-2.5 py-1.5 text-[10px] font-medium text-muted backdrop-blur-sm hover:bg-elevated hover:text-text"
          title="Graph filters"
        >
          Filters{hasFilters ? ` (${typeFilter.size + edgeLabelFilter.size + statusFilter.size})` : ''}
        </button>
        <button
          onClick={relayout}
          className="rounded-lg border border-border bg-surface/90 px-2.5 py-1.5 text-[10px] font-medium text-muted backdrop-blur-sm hover:bg-elevated hover:text-text"
          title="Re-run layout"
        >
          Re-layout
        </button>
      </div>
    );
  }

  return (
    <div className="absolute right-3 top-3 z-10 w-56 rounded-xl border border-border bg-surface/95 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted">
          Filters
        </span>
        <button
          onClick={() => setOpen(false)}
          className="text-[10px] text-muted hover:text-text"
        >
          Close
        </button>
      </div>

      {/* Node types */}
      <Section title="Node type">
        <div className="flex flex-wrap gap-1">
          {NODE_TYPES.map((t) => (
            <Chip
              key={t.key}
              label={t.label}
              color={t.color}
              active={typeFilter.size === 0 || typeFilter.has(t.key)}
              onClick={() => toggleType(t.key)}
            />
          ))}
        </div>
      </Section>

      {/* Edge labels */}
      <Section title="Edge type">
        <div className="flex flex-wrap gap-1">
          {EDGE_LABELS.map((l) => (
            <Chip
              key={l.key}
              label={l.label}
              color={l.color}
              active={edgeLabelFilter.size === 0 || edgeLabelFilter.has(l.key)}
              onClick={() => toggleEdgeLabel(l.key)}
            />
          ))}
        </div>
      </Section>

      {/* Status */}
      <Section title="Status">
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              color={s.color}
              active={statusFilter.size === 0 || statusFilter.has(s.key)}
              onClick={() => toggleStatus(s.key)}
            />
          ))}
        </div>
      </Section>

      {/* Actions */}
      <div className="flex gap-2 border-t border-border px-3 py-2">
        {hasFilters && (
          <button
            onClick={clearAll}
            className="text-[10px] text-muted hover:text-text"
          >
            Reset filters
          </button>
        )}
        <button
          onClick={relayout}
          className="ml-auto text-[10px] text-muted hover:text-text"
        >
          Re-layout
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border px-3 py-2">
      <span className="mb-1.5 block text-[9px] font-medium uppercase tracking-widest text-muted">
        {title}
      </span>
      {children}
    </div>
  );
}

function Chip({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white transition-opacity"
      style={{
        backgroundColor: color,
        opacity: active ? 1 : 0.25,
      }}
    >
      {label}
    </button>
  );
}
