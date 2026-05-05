/**
 * Force simulation configuration for the main Jarvis graph.
 *
 * The numbers below define the *feel* of the graph. They're isolated here
 * so you can iterate without touching the Graph component:
 *
 *   - LINK_DISTANCE        baseline edge length in pixels
 *   - CHARGE               node repulsion (more negative = more spacing)
 *   - COLLIDE_PAD          extra space around each node's radius
 *   - LONG_GOAL_GRAVITY    extra inward pull for long-term goal nodes
 *   - SHORT_GOAL_GRAVITY   extra outward push for short-term goal nodes
 *   - SHARED_TAG_BOOST     per-link strength multiplier when both ends
 *                          share a tag (loose clustering)
 *
 * Open the app, watch the graph settle, and tune these. Changes hot-reload.
 */

import * as d3 from 'd3';
import type { Edge, Node } from '@/types';

// ─── Tunable constants ──────────────────────────────────────────────────
export const LINK_DISTANCE = 75;
export const CHARGE = -80;
export const COLLIDE_PAD = 1;

export const LONG_GOAL_GRAVITY = 0.08;   // pulls toward center
export const SHORT_GOAL_GRAVITY = -0.04; // pushes away from center
export const SHARED_TAG_BOOST = 1.6;     // 1.0 = no boost

// Radial layout: most-connected nodes pulled toward center, sparsely
// connected ones to the outer ring. Strength is intentionally low so
// it acts as gentle structural gravity rather than a hard constraint —
// the user can still drag freely.
export const RADIAL_STRENGTH = 0.12;
export const RADIAL_MARGIN = 0.42; // fraction of min(width, height)
// ────────────────────────────────────────────────────────────────────────

export interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  tags: string[];
  radius: number;
  timeframe?: 'short' | 'long';
  opacity: number;            // used for goal fading
  connectionCount: number;
  nodeType: string;
}

export interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  source: string | SimNode;
  target: string | SimNode;
  createdBy: 'user' | 'claude';
  label?: string;
}

/** Node radius as a function of degree. Tuning: 4 + sqrt(d) * 3. */
export function radiusForDegree(degree: number): number {
  return 4 + Math.sqrt(degree) * 3;
}

/**
 * Construct the simulation objects (nodes, links) from raw data.
 * All nodes use the theme accent colour — tag colours are only for chips.
 */
export function buildSimData(
  nodes: Node[],
  edges: Edge[],
): { simNodes: SimNode[]; simLinks: SimLink[] } {
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  const simNodes: SimNode[] = nodes.map((n) => {
    const timeframe = (n.metadata.timeframe as 'short' | 'long' | undefined);
    const isGoal = n.tags.includes('area/goals');
    return {
      id: n.id,
      title: n.title,
      tags: n.tags,
      radius: radiusForDegree(degree.get(n.id) ?? 0),
      timeframe,
      // Long-term goals appear translucent per brief; short-term stay bright.
      opacity: isGoal && timeframe === 'long' ? 0.55 : 1,
      connectionCount: degree.get(n.id) ?? 0,
      nodeType: n.node_type,
    };
  });

  const simLinks: SimLink[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    createdBy: e.created_by,
    label: e.label,
  }));

  return { simNodes, simLinks };
}

/** Build a D3 force simulation using the tuning constants above. */
export function createSimulation(
  simNodes: SimNode[],
  simLinks: SimLink[],
  width: number,
  height: number,
): d3.Simulation<SimNode, SimLink> {
  const nodeById = new Map(simNodes.map((n) => [n.id, n]));

  const linkForce = d3
    .forceLink<SimNode, SimLink>(simLinks)
    .id((n) => n.id)
    .distance(LINK_DISTANCE)
    .strength((link) => {
      const src = typeof link.source === 'string' ? nodeById.get(link.source) : link.source;
      const tgt = typeof link.target === 'string' ? nodeById.get(link.target) : link.target;
      if (src && tgt && src.tags.some((t) => tgt.tags.includes(t))) {
        return (1 / Math.max(1, Math.min(src.connectionCount, tgt.connectionCount))) * SHARED_TAG_BOOST;
      }
      return 1 / Math.max(1, Math.min(src?.connectionCount ?? 1, tgt?.connectionCount ?? 1));
    });

  // Custom radial gravity for Goals based on timeframe.
  const goalGravity = (alpha: number) => {
    for (const n of simNodes) {
      if (!n.tags.includes('area/goals') || !n.timeframe) continue;
      const g = n.timeframe === 'long' ? LONG_GOAL_GRAVITY : SHORT_GOAL_GRAVITY;
      // Pull toward center (or push away) proportional to alpha and distance.
      const cx = width / 2;
      const cy = height / 2;
      const dx = cx - (n.x ?? cx);
      const dy = cy - (n.y ?? cy);
      n.vx = (n.vx ?? 0) + dx * g * alpha;
      n.vy = (n.vy ?? 0) + dy * g * alpha;
    }
  };

  // Radial layout: degree → target ring distance. Most-connected → center.
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(width, height) * RADIAL_MARGIN;
  const maxDegree = Math.max(1, ...simNodes.map((n) => n.connectionCount));
  const targetRadius = (n: SimNode): number => {
    const norm = n.connectionCount / maxDegree; // 0..1
    return (1 - norm) * maxR;
  };

  // Seed initial positions on a circle at each node's target ring,
  // angle-sorted by degree (descending) so the cold-open frame is
  // already structured rather than visually random.
  const sortedByDegreeDesc = [...simNodes].sort((a, b) => b.connectionCount - a.connectionCount);
  sortedByDegreeDesc.forEach((n, i) => {
    if (n.x != null && n.y != null && (n.x !== 0 || n.y !== 0)) return;
    const r = targetRadius(n);
    const theta = (i / sortedByDegreeDesc.length) * Math.PI * 2;
    n.x = cx + Math.cos(theta) * r;
    n.y = cy + Math.sin(theta) * r;
  });

  const sim = d3
    .forceSimulation<SimNode>(simNodes)
    .force('link', linkForce)
    .force('charge', d3.forceManyBody<SimNode>()
      .strength(CHARGE)
      .distanceMin(5)
      .distanceMax(150))
    .force('center', d3.forceCenter<SimNode>(cx, cy))
    .force(
      'radial',
      d3.forceRadial<SimNode>(targetRadius, cx, cy).strength(RADIAL_STRENGTH),
    )
    .force(
      'collide',
      d3.forceCollide<SimNode>().radius((n) => n.radius + COLLIDE_PAD).strength(0.5),
    )
    .force('goal-gravity', goalGravity)
    .alphaDecay(0.04);

  return sim;
}
