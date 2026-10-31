/**
 * Filter state and application.
 *
 * All 1,000 records live in memory, so filtering is a single pass over an array
 * and runs in well under a millisecond. That is the reason filters feel instant
 * and the reason the UI can afford to show live result counts for every option.
 */

import type { Filters, SeverityLevel, Sighting } from '../types/sighting';

export const EMPTY_FILTERS: Filters = {
  dateFrom: '',
  dateTo: '',
  species: new Set<string>(),
  severities: new Set<SeverityLevel>(),
  city: '',
  recentOnly: false,
  includeLocal: true,
};

export function cloneFilters(filters: Filters): Filters {
  return {
    ...filters,
    species: new Set(filters.species),
    severities: new Set(filters.severities),
  };
}

/**
 * `YYYY-MM-DD` to a timestamp. `end` pushes to the last millisecond of the day
 * so an inclusive upper bound actually includes sightings recorded that day —
 * the off-by-one that otherwise silently hides a whole day of data.
 */
function boundaryTimestamp(value: string, edge: 'start' | 'end'): number | null {
  if (!value) return null;
  const parts = value.split('-').map(Number);
  const [year, month, day] = parts;
  if (
    parts.length !== 3 ||
    year === undefined ||
    month === undefined ||
    day === undefined ||
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day)
  ) {
    return null;
  }
  return edge === 'start'
    ? new Date(year, month - 1, day, 0, 0, 0, 0).getTime()
    : new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

export interface FilterContext {
  /** Start of the recency window, from the dataset. */
  recentSince: number;
}

export function matchesFilters(
  sighting: Sighting,
  filters: Filters,
  context: FilterContext,
): boolean {
  if (!filters.includeLocal && sighting.source === 'local') return false;
  if (filters.city && sighting.location !== filters.city) return false;
  if (filters.species.size > 0 && !filters.species.has(sighting.species)) return false;
  if (filters.severities.size > 0 && !filters.severities.has(sighting.severity)) return false;
  if (filters.recentOnly && sighting.timestamp < context.recentSince) return false;

  const from = boundaryTimestamp(filters.dateFrom, 'start');
  if (from !== null && sighting.timestamp < from) return false;

  const to = boundaryTimestamp(filters.dateTo, 'end');
  if (to !== null && sighting.timestamp > to) return false;

  return true;
}

export function applyFilters(
  sightings: readonly Sighting[],
  filters: Filters,
  context: FilterContext,
): Sighting[] {
  return sightings.filter((sighting) => matchesFilters(sighting, filters, context));
}

/** True when nothing is narrowed, used to hide the "clear filters" affordance. */
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

/** Number of active narrowing filters, shown as a badge on the mobile toggle. */
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
 * Describes the active filters in a sentence, announced to screen readers after
 * a change so a non-sighted user learns the result of their action without
 * having to go and read the map.
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
