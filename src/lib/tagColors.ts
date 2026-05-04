/**
 * Category colour palette and assignment.
 *
 * Seed categories have fixed hues (so the existing seed nodes always look
 * the same). New categories cycle through an overflow palette so every
 * category stays visually distinct.
 *
 * `resolveColor(name, existing)` is the single source of truth — feed it
 * the map of already-known category→colour and it returns the colour for
 * `name`, creating a new one if needed.
 */

export const SEED_PALETTE: Record<string, string> = {
  'domain/ideas': '#3b82f6',        // blue-500
  'area/goals': '#f59e0b',          // amber-500
  'domain/quotes': '#8b5cf6',       // violet-500
  'area/research': '#14b8a6',       // teal-500
  'domain/books': '#ec4899',        // pink-500
  'domain/finance': '#22c55e',      // green-500
  'domain/math': '#f97316',         // orange-500
  'area/universities': '#6366f1',   // indigo-500
  'domain/general': '#6b7280',      // gray-500
};

/** Extra hues used when a brand-new category appears at runtime. */
export const OVERFLOW_PALETTE: readonly string[] = [
  '#ef4444', // red
  '#eab308', // yellow
  '#84cc16', // lime
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#d946ef', // fuchsia
  '#f43f5e', // rose
  '#a855f7', // purple
  '#78716c', // stone
];

export function resolveColor(
  name: string,
  existing: Record<string, string>,
): string {
  if (existing[name]) return existing[name];
  if (SEED_PALETTE[name]) return SEED_PALETTE[name];

  // Pick the first overflow hue not already taken.
  const taken = new Set(Object.values(existing));
  for (const c of OVERFLOW_PALETTE) {
    if (!taken.has(c)) return c;
  }
  // Fully saturated — reuse (rare in practice).
  return OVERFLOW_PALETTE[Object.keys(existing).length % OVERFLOW_PALETTE.length];
}
