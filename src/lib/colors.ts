/**
 * The bridge between data values and the validated colour tokens.
 *
 * Two rules this module exists to enforce:
 *
 *  1. **Colour follows the entity, never its rank.** A species keeps its slot
 *     whatever the chart or the filter state. If colours were assigned by sort
 *     position, filtering out the commonest species would repaint every
 *     survivor and the reader would have to re-learn the legend each time.
 *
 *  2. **No raw hex in components.** Everything resolves to a `var(--…)` so the
 *     light and dark values stay in one place and the palette cannot drift away
 *     from the values that were actually validated for contrast and CVD.
 *
 * Note the two different return styles. `var()` references are correct for CSS
 * and inline styles, but SVG-based charting libraries sometimes need a resolved
 * value, so `resolveCssVar` reads the computed value off the document when a
 * concrete colour is unavoidable.
 */

import type { SeverityLevel } from '../types/sighting';
import { SPECIES } from '../data/species';

/** Fixed species -> slot map, built once from the reference data. */
const SPECIES_SLOT = new Map<string, number>(
  SPECIES.map((species) => [species.name.toLowerCase(), species.colorSlot]),
);

/**
 * Colour for a species. An unknown species (one the API adds later) falls back
 * to a neutral grey rather than being assigned a generated hue — a ninth colour
 * invented at runtime would not have passed any of the separation checks.
 */
export function speciesColor(species: string): string {
  const slot = SPECIES_SLOT.get(species.toLowerCase());
  return slot === undefined ? 'var(--ink-muted)' : `var(--species-${slot})`;
}

export function severityColor(level: SeverityLevel): string {
  return `var(--severity-${level})`;
}

/**
 * Marker diameter in pixels, by severity.
 *
 * This is the second encoding of severity, and it is not decoration. The
 * severity ramp is single-hue and ordered by lightness precisely so it survives
 * colour-vision deficiency, but lightness alone is a weak channel on a busy
 * basemap. Size is unambiguous for everyone.
 */
export const MARKER_SIZE: Record<SeverityLevel, number> = {
  low: 11,
  moderate: 14,
  high: 17,
  severe: 21,
};

/**
 * Reads a custom property's computed value.
 *
 * Needed because Recharts writes some colours into SVG attributes where a
 * `var()` reference is not reliably honoured across browsers. Called from an
 * effect after mount, never during render, since it touches the DOM.
 */
export function resolveCssVar(name: string, fallback = '#888888'): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Cluster marker diameter, scaled by how many sightings it holds. */
export function clusterSize(count: number): number {
  if (count >= 100) return 52;
  if (count >= 50) return 46;
  if (count >= 20) return 40;
  if (count >= 10) return 36;
  return 32;
}
