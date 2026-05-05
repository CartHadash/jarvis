/**
 * Graph — the main visual of Jarvis.
 *
 * D3 owns the SVG imperatively: React just provides the <svg> host and
 * sends node/edge data in via the Zustand store. This is the standard
 * pattern for D3+React because the simulation mutates positions 60×/sec
 * and going through React state per-tick would be unacceptable.
 *
 * Features wired here:
 *   - force simulation via lib/forceSim
 *   - pan (drag background), zoom (scroll), drag nodes
 *   - hover: scale node + highlight connected edges
 *   - click: select node (opens NodePanel via store)
 *   - double-click: camera fly-to
 *   - search + category filter: fade non-matching to 15%
 *   - entrance animation: new nodes fade+scale 0→1 over 300ms
 *   - new edges animate stroke-dashoffset
 *   - store-driven fly-to via flyToCounter
 *   - auto-switch to canvas renderer at ≥200 nodes
 */

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { selectVisibleNodeIds, useGraphStore } from '@/hooks/useGraph';
import {
  buildSimData,
  createSimulation,
  type SimLink,
  type SimNode,
} from '@/lib/forceSim';
import { GraphCanvas } from '@/components/GraphCanvas';
import { edgeWidth } from '@/lib/graphConstants';

const EDGE_DIM = 0.12;
const NODE_DIM = 0.15;
const CANVAS_THRESHOLD = 200;
// Cursor "flashlight" model for label visibility:
// labels appear for the nearest MAX_PROXIMITY_LABELS nodes within
// PROXIMITY_RADIUS_PX of the cursor (screen-space), with smooth
// distance-based fade. Selected/hovered nodes and their 1-hop neighbors
// are always labeled regardless of cursor position.
const PROXIMITY_RADIUS_PX = 180;
const MAX_PROXIMITY_LABELS = 8;

const NODE_TYPE_COLORS: Record<string, string> = {
  concept: '#3b82f6',    // blue
  source: '#6b7280',     // gray
  goal: '#f59e0b',       // amber
  decision: '#a855f7',   // purple
  question: '#14b8a6',   // teal
  person: '#22c55e',     // green
  event: '#f97316',      // orange
};

const EDGE_LABEL_COLORS: Record<string, string> = {
  contradicts: '#ef4444',  // red
  supports: '#22c55e',     // green
  inspired_by: '#a855f7',  // purple
  prerequisite_for: '#f59e0b', // amber
  example_of: '#3b82f6',   // blue
  part_of: '#6366f1',      // indigo
  replaces: '#f97316',     // orange
  related_to: '#9ca3af',
};

const EDGE_LABEL_DISPLAY: Record<string, string> = {
  supports: 'supports',
  contradicts: 'contradicts',
  example_of: 'example of',
  prerequisite_for: 'prerequisite for',
  part_of: 'part of',
  related_to: 'related to',
  inspired_by: 'inspired by',
  replaces: 'replaces',
};

export function Graph() {
  const nodes = useGraphStore((s) => s.nodes);
  const useCanvas = nodes.length >= CANVAS_THRESHOLD;
  return useCanvas ? <GraphCanvas /> : <GraphSvg />;
}

function GraphSvg() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  // Track which IDs we've already animated in so re-renders don't replay them.
  const seenNodes = useRef<Set<string>>(new Set());
  const seenEdges = useRef<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectNode = useGraphStore((s) => s.selectNode);
  const hoverNode = useGraphStore((s) => s.hoverNode);

  // ── Main effect: (re)build the simulation when data changes ──────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const { width, height } = svg.getBoundingClientRect();

    const { simNodes, simLinks } = buildSimData(nodes, edges);

    // Teardown any previous sim before starting a new one.
    simRef.current?.stop();

    const sim = createSimulation(simNodes, simLinks, width, height);
    simRef.current = sim;
    setReady(true);

    const root = d3.select(svg);
    root.selectAll('*').remove();

    // ── Zoomable viewport ─────────────────────────────────────────────
    const viewport = root.append('g').attr('class', 'viewport');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4])
      .filter((event) => {
        const target = event.target as Element | null;
        if (event.type === 'wheel') return true;
        return !target?.closest('.jarvis-node');
      })
      .on('zoom', (event) => {
        viewport.attr('transform', event.transform.toString());
        // Re-evaluate proximity labels: zoom changes screen-space distances.
        scheduleLabelUpdate(focusedId);
      });
    root.call(zoom);
    zoomRef.current = zoom;

    // ── Edges ──────────────────────────────────────────────────────────
    const edgesG = viewport.append('g').attr('class', 'jarvis-edges');

    const linkSel = edgesG
      .selectAll<SVGLineElement, SimLink>('line')
      .data(simLinks, (d) => d.id)
      .join('line')
      .attr('data-id', (d) => d.id)
      .attr('stroke', (d) => EDGE_LABEL_COLORS[d.label ?? 'related_to'] ?? '#9ca3af')
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', (d) => edgeWidth(d.label))
      .attr('stroke-dasharray', (d) =>
        d.createdBy === 'claude' || d.label === 'replaces' ? '4 4' : null,
      );

    // Edge label text — hidden by default, shown on hover.
    const edgeLabelSel = edgesG
      .selectAll<SVGTextElement, SimLink>('text.edge-label')
      .data(simLinks, (d) => d.id)
      .join('text')
      .attr('class', 'edge-label')
      .text((d) => EDGE_LABEL_DISPLAY[d.label ?? 'related_to'] ?? d.label ?? '')
      .attr('text-anchor', 'middle')
      .attr('font-size', 9)
      .attr('fill', (d) => EDGE_LABEL_COLORS[d.label ?? 'related_to'] ?? 'rgb(var(--color-muted))')
      .attr('fill-opacity', 0)
      .style('pointer-events', 'none')
      .style('user-select', 'none');

    // Edge entrance: animate stroke-dashoffset from full length → 0.
    linkSel.each(function (d) {
      if (seenEdges.current.has(d.id)) return;
      seenEdges.current.add(d.id);
      const el = d3.select(this);
      const len = 200;
      el.attr('stroke-dasharray', d.createdBy === 'claude' ? '4 4' : `${len}`)
        .attr('stroke-dashoffset', d.createdBy === 'claude' ? 0 : len)
        .transition()
        .duration(450)
        .ease(d3.easeCubicOut)
        .attr('stroke-dashoffset', 0);
    });

    // ── Nodes ──────────────────────────────────────────────────────────
    const nodeSel = viewport
      .append('g')
      .attr('class', 'jarvis-nodes')
      .selectAll<SVGGElement, SimNode>('g.jarvis-node')
      .data(simNodes, (d) => d.id)
      .join('g')
      .attr('class', 'jarvis-node')
      .attr('data-id', (d) => d.id)
      .style('cursor', 'pointer');

    nodeSel
      .append('circle')
      .attr('r', (d) => d.radius)
      .attr('fill', (d) => NODE_TYPE_COLORS[d.nodeType] ?? '#6366f1')
      .attr('fill-opacity', (d) => d.opacity)
      .attr('stroke', 'rgb(var(--color-bg))')
      .attr('stroke-width', 1.5);

    nodeSel
      .append('text')
      .attr('class', 'node-label')
      .text((d) => truncate(d.title, 42))
      .attr('y', (d) => d.radius + 14)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11)
      .attr('fill', 'rgb(var(--color-muted))')
      .attr('fill-opacity', 0) // hidden by default; zoom/hover controls visibility
      .style('pointer-events', 'none')
      .style('user-select', 'none');

    // Track focused (clicked) node for persistent highlighting.
    let focusedId: string | null = null;

    /** Build the set of 1-hop neighbor IDs for a given node. */
    const getNeighbors = (nodeId: string | null): Set<string> => {
      const neighbors = new Set<string>();
      if (!nodeId) return neighbors;
      neighbors.add(nodeId);
      for (const l of simLinks) {
        const src = resolveId(l.source);
        const tgt = resolveId(l.target);
        if (src === nodeId) neighbors.add(tgt);
        if (tgt === nodeId) neighbors.add(src);
      }
      return neighbors;
    };

    /** Apply focus/dim styling based on hovered or focused node. */
    const applyHighlight = (activeId: string | null) => {
      if (activeId) {
        const neighbors = getNeighbors(activeId);
        nodeSel.style('opacity', (d) => (neighbors.has(d.id) ? 1 : NODE_DIM));
        linkSel.attr('stroke-opacity', (l) => {
          const src = resolveId(l.source);
          const tgt = resolveId(l.target);
          return src === activeId || tgt === activeId ? 0.95 : 0.15;
        });
        edgeLabelSel.attr('fill-opacity', (l) => {
          const src = resolveId(l.source);
          const tgt = resolveId(l.target);
          return src === activeId || tgt === activeId ? 0.9 : 0;
        });
      } else {
        nodeSel.style('opacity', 1);
        linkSel.attr('stroke-opacity', 0.4);
        edgeLabelSel.attr('fill-opacity', 0);
      }
    };

    // Cursor "flashlight" state — updated on mousemove, applied on rAF.
    let cursorPx: { x: number; y: number } | null = null;
    let labelRaf: number | null = null;

    /** Update node label visibility using the cursor-proximity model. */
    const updateLabelVisibility = (activeId: string | null = null) => {
      const neighbors = getNeighbors(activeId);
      const proxOpacity = new Map<string, number>();
      if (cursorPx) {
        const t = d3.zoomTransform(svg);
        const distances: { id: string; d: number }[] = [];
        for (const n of simNodes) {
          if (neighbors.has(n.id)) continue;
          const sx = t.applyX(n.x ?? 0);
          const sy = t.applyY(n.y ?? 0);
          const dist = Math.hypot(sx - cursorPx.x, sy - cursorPx.y);
          if (dist <= PROXIMITY_RADIUS_PX) distances.push({ id: n.id, d: dist });
        }
        distances.sort((a, b) => a.d - b.d);
        const k = Math.min(distances.length, MAX_PROXIMITY_LABELS);
        for (let i = 0; i < k; i++) {
          const { id, d } = distances[i];
          // Smooth fade: opacity = 1 at cursor, 0 at PROXIMITY_RADIUS_PX.
          proxOpacity.set(id, Math.max(0, 1 - d / PROXIMITY_RADIUS_PX));
        }
      }
      nodeSel.select<SVGTextElement>('text.node-label')
        .attr('fill-opacity', (d) => {
          if (neighbors.has(d.id)) return 1;
          return proxOpacity.get(d.id) ?? 0;
        });
    };

    /** rAF-throttled wrapper for mousemove-driven updates. */
    const scheduleLabelUpdate = (activeId: string | null = null) => {
      if (labelRaf != null) return;
      labelRaf = requestAnimationFrame(() => {
        labelRaf = null;
        updateLabelVisibility(activeId);
      });
    };

    // Background click: deselect + reset focus.
    root.on('click', (event) => {
      if (event.target === svg) {
        focusedId = null;
        selectNode(null);
        applyHighlight(null);
        updateLabelVisibility(null);
      }
    });

    // Cursor flashlight: track pointer in SVG-local coords, schedule rAF.
    root.on('mousemove.proximity', (event: MouseEvent) => {
      cursorPx = { x: event.offsetX, y: event.offsetY };
      scheduleLabelUpdate(focusedId);
    });
    root.on('mouseleave.proximity', () => {
      cursorPx = null;
      scheduleLabelUpdate(focusedId);
    });

    // Node entrance animation: fade + scale 0.3 → 1 over 300ms.
    nodeSel.each(function (d) {
      if (seenNodes.current.has(d.id)) return;
      seenNodes.current.add(d.id);
      const el = d3.select(this);
      el.style('opacity', 0).attr(
        'transform',
        `translate(${d.x ?? 0}, ${d.y ?? 0}) scale(0.3)`,
      );
      el.transition()
        .duration(300)
        .ease(d3.easeCubicOut)
        .style('opacity', 1)
        .attrTween('transform', () => {
          const i = d3.interpolateNumber(0.3, 1);
          return (t) =>
            `translate(${d.x ?? 0}, ${d.y ?? 0}) scale(${i(t)})`;
        });
      // Bump simulation alpha so the new node settles smoothly.
      sim.alpha(0.4).restart();
    });

    // ── Drag (node) ────────────────────────────────────────────────────
    const drag = d3
      .drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    nodeSel.call(drag);

    // ── Hover / click interactions ─────────────────────────────────────
    nodeSel
      .on('mouseenter', function (_event, d) {
        hoverNode(d.id);
        d3.select(this)
          .select('circle')
          .transition()
          .duration(150)
          .attr('r', d.radius * 1.15);
        applyHighlight(d.id);
        updateLabelVisibility(d.id);
      })
      .on('mouseleave', function (_event, d) {
        hoverNode(null);
        d3.select(this)
          .select('circle')
          .transition()
          .duration(150)
          .attr('r', d.radius);
        // Revert to focused state (or neutral if nothing focused).
        applyHighlight(focusedId);
        updateLabelVisibility(focusedId);
      })
      .on('click', (_event, d) => {
        focusedId = d.id;
        selectNode(d.id);
        applyHighlight(d.id);
        updateLabelVisibility(d.id);
      })
      .on('dblclick', (_event, d) => {
        flyTo(svg, zoom, d.x ?? 0, d.y ?? 0, 1.6);
      });

    // ── Tick: sync positions ───────────────────────────────────────────
    sim.on('tick', () => {
      linkSel
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);

      edgeLabelSel
        .attr('x', (d) => (((d.source as SimNode).x ?? 0) + ((d.target as SimNode).x ?? 0)) / 2)
        .attr('y', (d) => (((d.source as SimNode).y ?? 0) + ((d.target as SimNode).y ?? 0)) / 2 - 4);

      nodeSel.attr('transform', (d) => `translate(${d.x ?? 0}, ${d.y ?? 0})`);

      // Re-evaluate proximity labels while the simulation is moving so
      // they track moving nodes. rAF-throttle keeps this cheap.
      if (cursorPx) scheduleLabelUpdate(focusedId);
    });

    // ── Resize handler ─────────────────────────────────────────────────
    const onResize = () => {
      const r = svg.getBoundingClientRect();
      sim.force('center', d3.forceCenter(r.width / 2, r.height / 2));
      sim.alpha(0.3).restart();
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      if (labelRaf != null) cancelAnimationFrame(labelRaf);
      sim.stop();
    };
  }, [nodes, edges, hoverNode, selectNode]);

  // ── Visibility effect: subscribe to filter/search separately so we
  // don't tear down the simulation on every keystroke. ─────────────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const apply = () => {
      const state = useGraphStore.getState();
      const visible = selectVisibleNodeIds(state);
      const { edgeLabelFilter } = state;
      d3.select(svg)
        .selectAll<SVGGElement, SimNode>('g.jarvis-node')
        .style('opacity', (d) => (visible.has(d.id) ? 1 : NODE_DIM));
      d3.select(svg)
        .selectAll<SVGLineElement, SimLink>('.jarvis-edges line')
        .style('opacity', (l) => {
          const src = resolveId(l.source);
          const tgt = resolveId(l.target);
          if (!visible.has(src) || !visible.has(tgt)) return EDGE_DIM;
          if (edgeLabelFilter.size > 0 && !edgeLabelFilter.has(l.label ?? 'related_to')) return EDGE_DIM;
          return 1;
        });
    };
    apply();
    const unsub = useGraphStore.subscribe(
      (s) => ({
        search: s.search, filter: s.tagFilter, nodes: s.nodes,
        typeFilter: s.typeFilter, statusFilter: s.statusFilter, edgeLabelFilter: s.edgeLabelFilter,
      }),
      apply,
      {
        equalityFn: (a, b) =>
          a.search === b.search && a.filter === b.filter && a.nodes === b.nodes &&
          a.typeFilter === b.typeFilter && a.statusFilter === b.statusFilter &&
          a.edgeLabelFilter === b.edgeLabelFilter,
      },
    );
    return unsub;
  }, []);

  // ── Fly-to effect: subscribes to the store counter so external
  // requests (sidebar search, QuickAdd, NodePanel chip) trigger camera
  // movement without prop drilling. ────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    const unsub = useGraphStore.subscribe(
      (s) => s.flyToCounter,
      () => {
        const svg = svgRef.current;
        const zoom = zoomRef.current;
        const sim = simRef.current;
        if (!svg || !zoom || !sim) return;
        const id = useGraphStore.getState().flyToNodeId;
        if (!id) return;
        const target = sim.nodes().find((n) => n.id === id);
        if (!target) return;
        flyTo(svg, zoom, target.x ?? 0, target.y ?? 0, 1.8);
      },
    );
    return unsub;
  }, [ready]);

  // ── Re-layout: re-run simulation when triggered from filter panel ──
  useEffect(() => {
    if (!ready) return;
    const unsub = useGraphStore.subscribe(
      (s) => s.relayoutCounter,
      () => {
        const sim = simRef.current;
        if (!sim) return;
        sim.alpha(1).restart();
      },
    );
    return unsub;
  }, [ready]);

  return (
    <svg
      ref={svgRef}
      className="h-full w-full text-muted"
    />
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function resolveId(endpoint: string | SimNode): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function flyTo(
  svg: SVGSVGElement,
  zoom: d3.ZoomBehavior<SVGSVGElement, unknown>,
  x: number,
  y: number,
  k: number,
) {
  const { width, height } = svg.getBoundingClientRect();
  const t = d3.zoomIdentity.translate(width / 2 - x * k, height / 2 - y * k).scale(k);
  d3.select(svg).transition().duration(500).ease(d3.easeCubicInOut).call(zoom.transform, t);
}
