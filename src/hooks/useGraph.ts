/**
 * Central graph store (Zustand).
 *
 * Holds the source-of-truth nodes/edges/tags for the UI. The D3
 * simulation reads from here via `useGraphStore.getState()` on each tick
 * and writes back the settled positions — keeping React renders scoped
 * to actual data changes, not per-frame physics updates.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Edge, Node } from '@/types';
import { SEED_EDGES, SEED_NODES } from '@/lib/mockData';
import { resolveColor, SEED_PALETTE } from '@/lib/tagColors';
import {
  dbListTags,
  dbListEdges,
  dbListNodes,
} from '@/hooks/useDatabase';

export type TagFilter = Set<string>; // empty = show all

interface GraphState {
  nodes: Node[];
  edges: Edge[];
  tagColors: Record<string, string>;

  // UI state
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  tagFilter: TagFilter;
  search: string;
  /** Open/closed state for the QuickAdd modal. */
  quickAddOpen: boolean;
  /** Counter that the Graph effect watches to trigger fly-to a given node. */
  flyToCounter: number;
  flyToNodeId: string | null;
  /** Graph filter panel state. Empty set = show all. */
  typeFilter: Set<string>;
  edgeLabelFilter: Set<string>;
  statusFilter: Set<string>;
  /** Counter that Graph watches to re-run the simulation. */
  relayoutCounter: number;

  // Actions — mutations
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  upsertNode: (node: Node) => void;
  removeNode: (id: string) => void;
  upsertEdge: (edge: Edge) => void;
  removeEdge: (id: string) => void;

  // Actions — UI
  selectNode: (id: string | null) => void;
  hoverNode: (id: string | null) => void;
  toggleTagFilter: (tag: string, additive: boolean) => void;
  clearTagFilter: () => void;
  setSearch: (q: string) => void;
  setQuickAddOpen: (open: boolean) => void;
  flyToNode: (id: string) => void;
  toggleTypeFilter: (type: string) => void;
  toggleEdgeLabelFilter: (label: string) => void;
  toggleStatusFilter: (status: string) => void;
  clearGraphFilters: () => void;
  triggerRelayout: () => void;

  /** Pull state from the Tauri SQLite backend. Falls back silently when
   *  running outside Tauri (e.g. `npm run dev` in a browser tab). */
  bootstrap: () => Promise<void>;
}

/** True if we're running inside the Tauri runtime (vs. plain browser). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function buildColorMap(nodes: Node[]): Record<string, string> {
  const map: Record<string, string> = { ...SEED_PALETTE };
  for (const n of nodes) {
    for (const t of n.tags) {
      if (!map[t]) map[t] = resolveColor(t, map);
    }
  }
  return map;
}

/**
 * Attach connection arrays to nodes based on edges. This is a derived view
 * but it's cheap and keeps render code simple.
 */
function withConnections(nodes: Node[], edges: Edge[]): Node[] {
  const byId = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!byId.has(e.source)) byId.set(e.source, new Set());
    if (!byId.has(e.target)) byId.set(e.target, new Set());
    byId.get(e.source)!.add(e.target);
    byId.get(e.target)!.add(e.source);
  }
  return nodes.map((n) => ({
    ...n,
    connections: Array.from(byId.get(n.id) ?? []),
  }));
}

export const useGraphStore = create<GraphState>()(
  subscribeWithSelector((set) => ({
    nodes: withConnections(SEED_NODES, SEED_EDGES),
    edges: SEED_EDGES,
    tagColors: buildColorMap(SEED_NODES),

    selectedNodeId: null,
    hoveredNodeId: null,
    tagFilter: new Set(),
    search: '',
    quickAddOpen: false,
    flyToCounter: 0,
    flyToNodeId: null,
    typeFilter: new Set(),
    edgeLabelFilter: new Set(),
    statusFilter: new Set(),
    relayoutCounter: 0,

    setNodes: (nodes) =>
      set((s) => ({
        nodes: withConnections(nodes, s.edges),
        tagColors: buildColorMap(nodes),
      })),

    setEdges: (edges) =>
      set((s) => ({ edges, nodes: withConnections(s.nodes, edges) })),

    upsertNode: (node) =>
      set((s) => {
        const idx = s.nodes.findIndex((n) => n.id === node.id);
        const nextNodes = idx >= 0
          ? s.nodes.map((n, i) => (i === idx ? node : n))
          : [...s.nodes, node];
        return {
          nodes: withConnections(nextNodes, s.edges),
          tagColors: buildColorMap(nextNodes),
        };
      }),

    removeNode: (id) =>
      set((s) => {
        const nextNodes = s.nodes.filter((n) => n.id !== id);
        const nextEdges = s.edges.filter((e) => e.source !== id && e.target !== id);
        return {
          nodes: withConnections(nextNodes, nextEdges),
          edges: nextEdges,
          selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
        };
      }),

    upsertEdge: (edge) =>
      set((s) => {
        const idx = s.edges.findIndex((e) => e.id === edge.id);
        const nextEdges = idx >= 0
          ? s.edges.map((e, i) => (i === idx ? edge : e))
          : [...s.edges, edge];
        return { edges: nextEdges, nodes: withConnections(s.nodes, nextEdges) };
      }),

    removeEdge: (id) =>
      set((s) => {
        const nextEdges = s.edges.filter((e) => e.id !== id);
        return { edges: nextEdges, nodes: withConnections(s.nodes, nextEdges) };
      }),

    selectNode: (id) => set({ selectedNodeId: id }),
    hoverNode: (id) => set({ hoveredNodeId: id }),

    toggleTagFilter: (tag, additive) =>
      set((s) => {
        const next = new Set(additive ? s.tagFilter : []);
        if (next.has(tag) && additive) next.delete(tag);
        else next.add(tag);
        // Clicking the only active tag clears the filter.
        if (!additive && s.tagFilter.size === 1 && s.tagFilter.has(tag)) {
          return { tagFilter: new Set() };
        }
        return { tagFilter: next };
      }),

    clearTagFilter: () => set({ tagFilter: new Set() }),
    setSearch: (q) => set({ search: q }),
    setQuickAddOpen: (open) => set({ quickAddOpen: open }),
    flyToNode: (id) =>
      set((s) => ({ flyToNodeId: id, flyToCounter: s.flyToCounter + 1 })),

    toggleTypeFilter: (type) =>
      set((s) => {
        const next = new Set(s.typeFilter);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        return { typeFilter: next };
      }),

    toggleEdgeLabelFilter: (label) =>
      set((s) => {
        const next = new Set(s.edgeLabelFilter);
        if (next.has(label)) next.delete(label);
        else next.add(label);
        return { edgeLabelFilter: next };
      }),

    toggleStatusFilter: (status) =>
      set((s) => {
        const next = new Set(s.statusFilter);
        if (next.has(status)) next.delete(status);
        else next.add(status);
        return { statusFilter: next };
      }),

    clearGraphFilters: () =>
      set({ typeFilter: new Set(), edgeLabelFilter: new Set(), statusFilter: new Set() }),

    triggerRelayout: () =>
      set((s) => ({ relayoutCounter: s.relayoutCounter + 1 })),

    bootstrap: async () => {
      if (!isTauri()) return; // browser dev mode keeps mock data
      try {
        const [nodes, edges, tags] = await Promise.all([
          dbListNodes(),
          dbListEdges(),
          dbListTags(),
        ]);
        const tagColors: Record<string, string> = { ...SEED_PALETTE };
        for (const t of tags) tagColors[t.name] = t.color;
        set({
          nodes: withConnections(nodes, edges),
          edges,
          tagColors,
          selectedNodeId: null,
          hoveredNodeId: null,
        });
      } catch (err) {
        // Surface but don't crash — graph remains on whatever state it had.
        console.error('[jarvis] bootstrap failed', err);
      }
    },
  })),
);

/** Convenience selectors. */
export const selectTags = (s: GraphState) =>
  Array.from(new Set(s.nodes.flatMap((n) => n.tags))).sort();

export const selectVisibleNodeIds = (s: GraphState): Set<string> => {
  const q = s.search.trim().toLowerCase();
  const { tagFilter, typeFilter, statusFilter } = s;
  const noFilters = !q && tagFilter.size === 0 && typeFilter.size === 0 && statusFilter.size === 0;
  if (noFilters) return new Set(s.nodes.map((n) => n.id));
  return new Set(
    s.nodes
      .filter((n) => tagFilter.size === 0 || n.tags.some((t) => tagFilter.has(t)))
      .filter((n) => typeFilter.size === 0 || typeFilter.has(n.node_type))
      .filter((n) => statusFilter.size === 0 || statusFilter.has(n.status))
      .filter((n) => {
        if (!q) return true;
        return (
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q)
        );
      })
      .map((n) => n.id),
  );
};
