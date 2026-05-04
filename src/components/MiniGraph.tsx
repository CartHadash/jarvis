/**
 * MiniGraph — depth-1 neighbourhood of the selected node.
 *
 * A small (~180px square) D3 SVG drawn with the same simulation config
 * as the main graph but scoped to just `node + immediate neighbours`. It
 * gives the right panel spatial context without requiring you to lose
 * the main view's zoom state.
 */

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { Node } from '@/types';
import { useGraphStore } from '@/hooks/useGraph';
import { buildSimData, createSimulation, type SimNode } from '@/lib/forceSim';

interface Props {
  centerNode: Node;
  size?: number;
}

export function MiniGraph({ centerNode, size = 180 }: Props) {
  const ref = useRef<SVGSVGElement | null>(null);
  const allNodes = useGraphStore((s) => s.nodes);
  const allEdges = useGraphStore((s) => s.edges);
  const selectNode = useGraphStore((s) => s.selectNode);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;

    // Scope to depth-1 neighbourhood
    const neighbourIds = new Set<string>([centerNode.id, ...centerNode.connections]);
    const subNodes = allNodes.filter((n) => neighbourIds.has(n.id));
    const subEdges = allEdges.filter(
      (e) => neighbourIds.has(e.source) && neighbourIds.has(e.target),
    );

    const { simNodes, simLinks } = buildSimData(subNodes, subEdges);
    const sim = createSimulation(simNodes, simLinks, size, size);
    sim.alpha(0.8).restart();

    const root = d3.select(svg);
    root.selectAll('*').remove();

    const linkSel = root
      .append('g')
      .attr('stroke', 'currentColor')
      .attr('stroke-opacity', 0.4)
      .selectAll<SVGLineElement, (typeof simLinks)[number]>('line')
      .data(simLinks)
      .join('line')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', (d) => (d.createdBy === 'claude' ? '3 3' : null));

    const nodeSel = root
      .append('g')
      .selectAll<SVGCircleElement, SimNode>('circle')
      .data(simNodes)
      .join('circle')
      .attr('r', (d) => (d.id === centerNode.id ? 6 : 4))
      .attr('fill', 'rgb(var(--color-accent))')
      .attr('fill-opacity', (d) => (d.id === centerNode.id ? 1 : 0.7))
      .attr('stroke', 'rgb(var(--color-surface))')
      .attr('stroke-width', 1.5)
      .style('cursor', (d) => (d.id === centerNode.id ? 'default' : 'pointer'))
      .on('click', (_e, d) => {
        if (d.id !== centerNode.id) selectNode(d.id);
      });

    sim.on('tick', () => {
      linkSel
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);
      nodeSel.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);
    });

    return () => {
      sim.stop();
    };
  }, [centerNode, allNodes, allEdges, size, selectNode]);

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      className="rounded-md border border-border bg-bg text-muted"
      viewBox={`0 0 ${size} ${size}`}
    />
  );
}
