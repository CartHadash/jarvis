/**
 * Sidebar — search, tag cloud filter, quick-add trigger.
 *
 * Tags are displayed as a flowing tag cloud of coloured chips. Each chip
 * shows the tag name and a count badge. Click to toggle filter (OR logic);
 * active chips get a ring. Cmd+click to multi-select.
 */

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { selectTags, useGraphStore } from '@/hooks/useGraph';

export function Sidebar() {
  const search = useGraphStore((s) => s.search);
  const setSearch = useGraphStore((s) => s.setSearch);
  const filter = useGraphStore((s) => s.tagFilter);
  const toggle = useGraphStore((s) => s.toggleTagFilter);
  const clear = useGraphStore((s) => s.clearTagFilter);
  const tagColors = useGraphStore((s) => s.tagColors);
  const tags = useGraphStore(useShallow(selectTags));
  const nodes = useGraphStore((s) => s.nodes);
  const selectNode = useGraphStore((s) => s.selectNode);
  const flyToNode = useGraphStore((s) => s.flyToNode);

  const countByTag = (tag: string) =>
    nodes.reduce((acc, n) => acc + (n.tags.includes(tag) ? 1 : 0), 0);

  // Live search results: show top 8 matches when there's a query.
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return nodes
      .filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [nodes, search]);

  return (
    <aside
      className="no-select flex w-64 shrink-0 flex-col gap-4 border-r border-border bg-surface p-3"
      aria-label="Sidebar"
    >
      {/* ─── Search ─────────────────────────────────────────────── */}
      <div>
        <label
          htmlFor="jarvis-search"
          className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-muted"
        >
          Search
        </label>
        <input
          id="jarvis-search"
          type="search"
          placeholder="Find a node…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-border bg-elevated px-2.5 py-1.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
        />

        {matches.length > 0 && (
          <ul className="mt-1.5 max-h-60 space-y-0.5 overflow-y-auto rounded-md border border-border bg-elevated p-1">
            {matches.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    selectNode(n.id);
                    flyToNode(n.id);
                  }}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[12px] text-muted hover:bg-bg hover:text-text"
                >
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  />
                  <span className="truncate">{n.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ─── Tag cloud ────────────────────────────────────────── */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted">
            Tags
          </span>
          {filter.size > 0 && (
            <button
              type="button"
              onClick={clear}
              className="text-[10px] text-muted underline-offset-2 hover:text-text hover:underline"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const active = filter.has(tag);
            const dimmed = filter.size > 0 && !active;
            const color = tagColors[tag] ?? '#6b7280';
            const count = countByTag(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={(e) => toggle(tag, e.metaKey || e.ctrlKey)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-white transition-all ${
                  active ? 'ring-2 ring-white/50 ring-offset-1 ring-offset-bg' : ''
                } ${dimmed ? 'opacity-40' : ''}`}
                style={{ backgroundColor: color }}
              >
                <span>{tag}</span>
                <span className="rounded-full bg-black/20 px-1.5 text-[9px]">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-muted">
          Click to isolate, <kbd className="font-mono">⌘</kbd>+click to
          multi-select.
        </p>
      </div>
    </aside>
  );
}
