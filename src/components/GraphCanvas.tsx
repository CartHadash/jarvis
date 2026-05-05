/**
 * GraphCanvas — canvas renderer, used automatically when the graph
 * contains ≥200 nodes. Uses the same D3 force simulation as the SVG
 * path so the layout is identical; only the draw step differs.
 *
 * Interaction model:
 *   - pan: drag empty space
 *   - zoom: wheel
 *   - hover: move mouse over a node (cursor + highlight)
 *   - click: select node
 *   - double-click: fly to node
 *
 * Drag of individual nodes is intentionally omitted in canvas mode to
 * keep the inner loop tight at scale.
 */

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { selectVisibleNodeIds, useGraphStore } from '@/hooks/useGraph';
import { edgeWidth } from '@/lib/graphConstants';
import {
  buildSimData,
  createSimulation,
  type SimLink,
  type SimNode,
} from '@/lib/forceSim';

const DPR = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

export function GraphCanvas() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const hoverIdRef = useRef<string | null>(null);
  const focusedIdRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectNode = useGraphStore((s) => s.selectNode);
  const hoverNode = useGraphStore((s) => s.hoverNode);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { simNodes, simLinks } = buildSimData(nodes, edges);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * DPR;
      canvas.height = r.height * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();

    const { width, height } = canvas.getBoundingClientRect();
    simRef.current?.stop();
    const sim = createSimulation(simNodes, simLinks, width, height);
    simRef.current = sim;
    setReady(true);

    const draw = () => {
      const t = transformRef.current;
      const r = canvas.getBoundingClientRect();
      ctx.save();
      ctx.clearRect(0, 0, r.width, r.height);
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);

      const state = useGraphStore.getState();
      const visible = selectVisibleNodeIds(state);
      const canvasEdgeLabelFilter = state.edgeLabelFilter;

      // Focus / hover highlighting — build 1-hop neighbor set.
      const activeId = hoverIdRef.current ?? focusedIdRef.current;
      const focusNeighbors = new Set<string>();
      if (activeId) {
        focusNeighbors.add(activeId);
        for (const l of simLinks) {
          const src = typeof l.source === 'string' ? l.source : (l.source as SimNode).id;
          const tgt = typeof l.target === 'string' ? l.target : (l.target as SimNode).id;
          if (src === activeId) focusNeighbors.add(tgt);
          if (tgt === activeId) focusNeighbors.add(src);
        }
      }
      const hasFocus = focusNeighbors.size > 0;

      // Edge label → color mapping
      const edgeColorMap: Record<string, string> = {
        contradicts: 'rgba(239,68,68,0.5)',
        supports: 'rgba(34,197,94,0.5)',
        inspired_by: 'rgba(168,85,247,0.5)',
        prerequisite_for: 'rgba(245,158,11,0.5)',
        example_of: 'rgba(59,130,246,0.5)',
        part_of: 'rgba(99,102,241,0.5)',
        replaces: 'rgba(249,115,22,0.5)',
      };
      const dimEdgeColor: Record<string, string> = {
        contradicts: 'rgba(239,68,68,0.08)',
        supports: 'rgba(34,197,94,0.08)',
        inspired_by: 'rgba(168,85,247,0.08)',
        prerequisite_for: 'rgba(245,158,11,0.08)',
        example_of: 'rgba(59,130,246,0.08)',
        part_of: 'rgba(99,102,241,0.08)',
        replaces: 'rgba(249,115,22,0.08)',
      };

      // Edges
      for (const l of simLinks) {
        const s = l.source as SimNode;
        const tg = l.target as SimNode;
        const vis = visible.has(s.id) && visible.has(tg.id);
        const label = l.label ?? 'related_to';
        const edgeFocused = !hasFocus || (focusNeighbors.has(s.id) && focusNeighbors.has(tg.id));
        const labelVisible = canvasEdgeLabelFilter.size === 0 || canvasEdgeLabelFilter.has(label);
        ctx.strokeStyle = (vis && edgeFocused && labelVisible)
          ? (edgeColorMap[label] ?? 'rgba(156,163,175,0.45)')
          : (dimEdgeColor[label] ?? 'rgba(120,120,140,0.08)');
        ctx.lineWidth = edgeWidth(label);
        if (l.createdBy === 'claude' || label === 'replaces') ctx.setLineDash([4, 4]);
        else ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(s.x ?? 0, s.y ?? 0);
        ctx.lineTo(tg.x ?? 0, tg.y ?? 0);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Nodes — colored by node type
      const nodeTypeColors: Record<string, string> = {
        concept: '#3b82f6', source: '#6b7280', goal: '#f59e0b',
        decision: '#a855f7', question: '#14b8a6', person: '#22c55e',
        event: '#f97316',
      };
      const hoverId = hoverIdRef.current;
      for (const n of simNodes) {
        const vis = visible.has(n.id);
        const focused = !hasFocus || focusNeighbors.has(n.id);
        const r = (hoverId === n.id ? n.radius * 1.15 : n.radius);
        ctx.globalAlpha = vis && focused ? n.opacity : 0.15;
        ctx.fillStyle = nodeTypeColors[n.nodeType] ?? '#6366f1';
        ctx.beginPath();
        ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    };

    sim.on('tick', draw);

    // ── Zoom + pan ────────────────────────────────────────────────────
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.25, 4])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        draw();
      });
    d3.select(canvas).call(zoom);

    // ── Hover / click ─────────────────────────────────────────────────
    const findAt = (clientX: number, clientY: number): SimNode | undefined => {
      const r = canvas.getBoundingClientRect();
      const t = transformRef.current;
      const x = (clientX - r.left - t.x) / t.k;
      const y = (clientY - r.top - t.y) / t.k;
      // Reverse iterate so visually-on-top hits first.
      for (let i = simNodes.length - 1; i >= 0; i--) {
        const n = simNodes[i];
        const dx = (n.x ?? 0) - x;
        const dy = (n.y ?? 0) - y;
        if (dx * dx + dy * dy <= n.radius * n.radius) return n;
      }
      return undefined;
    };

    const onMove = (e: MouseEvent) => {
      const hit = findAt(e.clientX, e.clientY);
      const hoveredId = hit?.id ?? null;
      if (hoverIdRef.current !== hoveredId) {
        hoverIdRef.current = hoveredId;
        hoverNode(hoveredId);
        canvas.style.cursor = hoveredId ? 'pointer' : 'default';
        draw();
      }
    };
    const onClick = (e: MouseEvent) => {
      const hit = findAt(e.clientX, e.clientY);
      focusedIdRef.current = hit?.id ?? null;
      selectNode(hit?.id ?? null);
      draw();
    };
    const onDbl = (e: MouseEvent) => {
      const hit = findAt(e.clientX, e.clientY);
      if (!hit) return;
      flyToCanvas(canvas, zoom, hit.x ?? 0, hit.y ?? 0, 1.8);
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('dblclick', onDbl);

    const onResize = () => {
      resize();
      const r = canvas.getBoundingClientRect();
      sim.force('center', d3.forceCenter(r.width / 2, r.height / 2));
      sim.alpha(0.3).restart();
    };
    window.addEventListener('resize', onResize);

    // External fly-to.
    const unsubFly = useGraphStore.subscribe(
      (s) => s.flyToCounter,
      () => {
        const id = useGraphStore.getState().flyToNodeId;
        if (!id) return;
        const target = simNodes.find((n) => n.id === id);
        if (!target) return;
        flyToCanvas(canvas, zoom, target.x ?? 0, target.y ?? 0, 1.8);
      },
    );

    // Re-draw on filter/search updates.
    const unsubVis = useGraphStore.subscribe(
      (s) => ({
        search: s.search, filter: s.tagFilter,
        typeFilter: s.typeFilter, statusFilter: s.statusFilter, edgeLabelFilter: s.edgeLabelFilter,
      }),
      () => draw(),
      {
        equalityFn: (a, b) =>
          a.search === b.search && a.filter === b.filter &&
          a.typeFilter === b.typeFilter && a.statusFilter === b.statusFilter &&
          a.edgeLabelFilter === b.edgeLabelFilter,
      },
    );

    // Re-layout trigger.
    const unsubRelayout = useGraphStore.subscribe(
      (s) => s.relayoutCounter,
      () => { sim.alpha(1).restart(); },
    );

    return () => {
      sim.stop();
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('dblclick', onDbl);
      window.removeEventListener('resize', onResize);
      unsubFly();
      unsubVis();
      unsubRelayout();
    };
  }, [nodes, edges, hoverNode, selectNode]);

  return (
    <canvas
      ref={ref}
      className="h-full w-full"
      style={{ display: 'block' }}
      aria-label="Graph canvas"
      role="img"
      data-ready={ready}
    />
  );
}

function flyToCanvas(
  canvas: HTMLCanvasElement,
  zoom: d3.ZoomBehavior<HTMLCanvasElement, unknown>,
  x: number,
  y: number,
  k: number,
) {
  const { width, height } = canvas.getBoundingClientRect();
  const t = d3.zoomIdentity.translate(width / 2 - x * k, height / 2 - y * k).scale(k);
  d3.select(canvas).transition().duration(500).ease(d3.easeCubicInOut).call(zoom.transform, t);
}
