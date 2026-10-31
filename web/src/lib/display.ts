/**
 * Presentation constants and small client-side derivations.
 *
 * What survived the move to a server-side pipeline, and why:
 *
 *  - Month names and labels are formatting, not analysis.
 *  - The severity methodology constants are here so the About page can
 *    *describe* the model. The model itself runs on the server
 *    (`server/src/domain/severity.ts`); these are the numbers it is documented
 *    with, and the live breakpoints come from `/api/meta` rather than from
 *    anything hard-coded here.
 *  - Filter helpers operate on filter state, which is client-owned.
 *
 * Deleted outright: the severity model, the geocoder, the normaliser and the
 * local-storage repository. All four now live on the server, which is where
 * data processing belongs — and keeping a second copy in the browser would be
 * the fastest possible route to the two disagreeing.
 */

import type { Filters, SeverityLevel, Sighting } from '../types/sighting';
import { sightingTimestamp } from '../types/sighting';

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const MONTH_LABELS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * How the server's severity model is composed, for the explanatory UI.
 *
 * Mirrors `SEVERITY_METHODOLOGY` in `server/src/domain/severity.ts`. Weights
 * are also returned per-component on every sighting, so these are used only
 * where the model is described in the abstract rather than for a specific
 * record.
 */
export const SEVERITY_METHODOLOGY = {
  windowDays: 45,
  weights: { density: 0.5, species: 0.3, season: 0.2 },
  /** Share of the dataset each level is designed to hold. */
  levelShares: { low: 0.3, moderate: 0.3, high: 0.25, severe: 0.15 },
} as const;

export const SEASON_PEAK_MONTHS =
  'April to June, with a second rise in September and October';

/** Human-readable label for each severity level. */
export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  severe: 'Severe',
};

export const SEVERITY_DESCRIPTIONS: Record<SeverityLevel, string> = {
  low: 'Background activity. Standard year-round tick checks are appropriate.',
  moderate: 'Raised activity. Check pets after every walk in long grass or woodland.',
  high: 'Elevated activity for this area and time of year. Use a preventative treatment and check thoroughly.',
  severe: 'Among the highest-scoring sightings in the dataset. Treat the area as high exposure.',
};

/** Radius used to decide what counts as "the same area" as a given sighting. */
export const AREA_RADIUS_KM = 25;

/* -------------------------------------------------------- filter state */

/**
 * The unfiltered default.
 *
 * Lives here rather than beside the provider so that a module exporting a
 * React component does not also export a constant — which breaks Fast Refresh
 * and forces a full reload on every edit.
 */
export const EMPTY_FILTERS: Filters = {
  dateFrom: '',
  dateTo: '',
  species: new Set<string>(),
  severities: new Set<SeverityLevel>(),
  city: '',
  recentOnly: false,
  includeLocal: true,
};

/** True when nothing is narrowed — hides the "clear filters" affordance. */
export function isDefaultFilters(filters: Filters): boolean {
  return (
    filters.dateFrom === '' &&
    filters.dateTo === '' &&
    filters.species.size === 0 &&
    filters.severities.size === 0 &&
    filters.city === '' &&
    !filters.recentOnly &&
    filters.includeLocal
  );
}

/** Number of active narrowing filters, for the badge on the mobile toggle. */
export function activeFilterCount(filters: Filters): number {
  let count = 0;
  if (filters.dateFrom) count += 1;
  if (filters.dateTo) count += 1;
  if (filters.species.size > 0) count += 1;
  if (filters.severities.size > 0) count += 1;
  if (filters.city) count += 1;
  if (filters.recentOnly) count += 1;
  if (!filters.includeLocal) count += 1;
  return count;
}

/**
 * Describes the active filters in a sentence, announced to screen readers
 * after a change so a non-sighted user learns the result of their action
 * without having to go and read the map.
 */
export function describeFilters(filters: Filters, resultCount: number): string {
  const parts: string[] = [];
  if (filters.city) parts.push(`in ${filters.city}`);
  if (filters.species.size > 0) {
    parts.push(
      filters.species.size === 1
        ? `of species ${[...filters.species][0]}`
        : `across ${filters.species.size} species`,
    );
  }
  if (filters.severities.size > 0) {
    parts.push(`rated ${[...filters.severities].join(' or ')}`);
  }
  if (filters.dateFrom && filters.dateTo) {
    parts.push(`between ${filters.dateFrom} and ${filters.dateTo}`);
  } else if (filters.dateFrom) {
    parts.push(`from ${filters.dateFrom}`);
  } else if (filters.dateTo) {
    parts.push(`up to ${filters.dateTo}`);
  }
  if (filters.recentOnly) parts.push('in the most recent period of the data');

  const noun = resultCount === 1 ? 'sighting' : 'sightings';
  if (parts.length === 0) {
    return `Showing all ${resultCount.toLocaleString('en-GB')} ${noun}.`;
  }
  return `Showing ${resultCount.toLocaleString('en-GB')} ${noun} ${parts.join(', ')}.`;
}

/* ------------------------------------------------- local aggregations */

/**
 * Great-circle distance in km.
 *
 * Retained client-side because the "activity in this area" timeline works over
 * the sightings already on screen; asking the server for a radius query to
 * group a list the browser is holding would be a round trip for nothing.
 */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

/** Other sightings near a given one, by city centroid rather than jittered point. */
export function sightingsInArea(
  sightings: readonly Sighting[],
  focus: Sighting,
  radiusKm = AREA_RADIUS_KM,
): Sighting[] {
  return sightings.filter(
    (candidate) =>
      distanceKm(focus.cityLat, focus.cityLng, candidate.cityLat, candidate.cityLng) <= radiusKm,
  );
}

export interface SpeciesCount {
  species: string;
  count: number;
}

export function speciesCounts(sightings: readonly Sighting[]): SpeciesCount[] {
  const counts = new Map<string, number>();
  for (const sighting of sightings) {
    counts.set(sighting.species, (counts.get(sighting.species) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([species, count]) => ({ species, count }))
    .sort((a, b) => b.count - a.count);
}

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  severe: 3,
};

export interface TimelineBucket {
  year: number;
  count: number;
  species: SpeciesCount[];
  peakSeverity: SeverityLevel;
}

/** Per-year activity for an area, newest first — the detail panel's timeline. */
export function buildAreaTimeline(areaSightings: readonly Sighting[]): TimelineBucket[] {
  const byYear = new Map<number, Sighting[]>();
  for (const sighting of areaSightings) {
    const year = new Date(sightingTimestamp(sighting)).getFullYear();
    const bucket = byYear.get(year);
    if (bucket) bucket.push(sighting);
    else byYear.set(year, [sighting]);
  }

  return [...byYear.entries()]
    .map(([year, group]) => {
      let peak: SeverityLevel = 'low';
      for (const sighting of group) {
        if (SEVERITY_RANK[sighting.severityLevel] > SEVERITY_RANK[peak]) {
          peak = sighting.severityLevel;
        }
      }
      return { year, count: group.length, species: speciesCounts(group), peakSeverity: peak };
    })
    .sort((a, b) => b.year - a.year);
}

export function timelinePeak(buckets: readonly TimelineBucket[]): number {
  return buckets.reduce((max, bucket) => Math.max(max, bucket.count), 0);
}
