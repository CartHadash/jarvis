/**
 * Visual constants shared between SVG (Graph.tsx) and Canvas
 * (GraphCanvas.tsx) renderers.
 *
 * Edge widths express *semantic importance*: structural relationships
 * (supports / part_of / prerequisite_for) are thicker than associative
 * ones (related_to / inspired_by). This gives the eye a reliable
 * hierarchy without colour alone.
 */

import type { EdgeLabel } from '@/types';

export const EDGE_WIDTH: Record<EdgeLabel, number> = {
  // Thick — load-bearing structural relationships
  supports: 2.5,
  part_of: 2.5,
  prerequisite_for: 2.5,
  // Medium — directional / counter / replacement
  example_of: 1.5,
  contradicts: 1.5,
  replaces: 1.5,
  // Thin — soft associative
  related_to: 0.8,
  inspired_by: 0.8,
};

/**
 * Lookup with fallback for legacy/unknown labels.
 */
export function edgeWidth(label: string | null | undefined): number {
  if (!label) return EDGE_WIDTH.related_to;
  return EDGE_WIDTH[label as EdgeLabel] ?? EDGE_WIDTH.related_to;
}
