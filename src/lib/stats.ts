/**
 * Aggregations behind the charts, stat tiles and timeline.
 *
 * Kept as pure functions over a `Sighting[]` so each one can be memoised in the
 * component that needs it and reasoned about on its own.
 */

import type { SeverityLevel, Sighting } from '../types/sighting';
import { MONTH_LABELS_SHORT } from './severity';
import { distanceKm } from './geo';

export interface MonthlyPoint {
  /** `Jan`, `Feb`, … */
  month: string;
  monthIndex: number;
  count: number;
}

/**
 * Sightings per calendar month. Always returns all twelve months, including
 * empty ones: dropping a zero month would compress the x-axis and make a quiet
 * January look like it simply did not exist.
 */
export function monthlyCounts(sightings: readonly Sighting[]): MonthlyPoint[] {
  const counts = new Array<number>(12).fill(0);
  for (const sighting of sightings) {
    const month = new Date(sighting.timestamp).getMonth();
    counts[month] = (counts[month] ?? 0) + 1;
  }
  return MONTH_LABELS_SHORT.map((month, monthIndex) => ({
    month,
    monthIndex,
    count: counts[monthIndex] ?? 0,
  }));
}

export interface YearlyPoint {
  year: number;
  count: number;
}

/** Sightings per year, filling gap years with zero for a continuous axis. */
export function yearlyCounts(sightings: readonly Sighting[]): YearlyPoint[] {
  if (sightings.length === 0) return [];
  const counts = new Map<number, number>();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const sighting of sightings) {
    const year = new Date(sighting.timestamp).getFullYear();
    counts.set(year, (counts.get(year) ?? 0) + 1);
    if (year < min) min = year;
    if (year > max) max = year;
  }

  const series: YearlyPoint[] = [];
  for (let year = min; year <= max; year += 1) {
    series.push({ year, count: counts.get(year) ?? 0 });
  }
  return series;
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

export function severityCounts(
  sightings: readonly Sighting[],
): Record<SeverityLevel, number> {
  const counts: Record<SeverityLevel, number> = {
    low: 0,
    moderate: 0,
    high: 0,
    severe: 0,
  };
  for (const sighting of sightings) counts[sighting.severity] += 1;
  return counts;
}

export interface CityCount {
  city: string;
  count: number;
}

export function cityCounts(sightings: readonly Sighting[]): CityCount[] {
  const counts = new Map<string, number>();
  for (const sighting of sightings) {
    counts.set(sighting.location, (counts.get(sighting.location) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, 'en-GB'));
}

/** Radius used to decide what counts as "the same area" as a given sighting. */
export const AREA_RADIUS_KM = 25;

/**
 * Other sightings near a given one. Uses the city centroid, not the jittered
 * point, so the result is a property of the city rather than of the cosmetic
 * offset we applied for display.
 */
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

export interface TimelineBucket {
  year: number;
  count: number;
  /** Species seen that year in this area, most frequent first. */
  species: SpeciesCount[];
  /** Highest severity recorded in the bucket. */
  peakSeverity: SeverityLevel;
}

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  severe: 3,
};

/**
 * Per-year activity for an area, newest year first — the data behind the
 * "activity progression" timeline in the detail panel.
 */
export function buildAreaTimeline(areaSightings: readonly Sighting[]): TimelineBucket[] {
  const byYear = new Map<number, Sighting[]>();
  for (const sighting of areaSightings) {
    const year = new Date(sighting.timestamp).getFullYear();
    const bucket = byYear.get(year);
    if (bucket) bucket.push(sighting);
    else byYear.set(year, [sighting]);
  }

  return [...byYear.entries()]
    .map(([year, group]) => {
      let peak: SeverityLevel = 'low';
      for (const sighting of group) {
        if (SEVERITY_RANK[sighting.severity] > SEVERITY_RANK[peak]) peak = sighting.severity;
      }
      return {
        year,
        count: group.length,
        species: speciesCounts(group),
        peakSeverity: peak,
      };
    })
    .sort((a, b) => b.year - a.year);
}

/** Highest value in a timeline, for scaling the inline bars. */
export function timelinePeak(buckets: readonly TimelineBucket[]): number {
  return buckets.reduce((max, bucket) => Math.max(max, bucket.count), 0);
}

export interface Trend {
  /** Percentage change, rounded. Positive means an increase. */
  changePercent: number;
  direction: 'up' | 'down' | 'flat';
  recentCount: number;
  previousCount: number;
}

/**
 * Compares the most recent window against the window immediately before it.
 * Returns null when there is not enough history to make the comparison
 * meaningful — better to show nothing than a "+100%" built on two data points.
 */
export function computeTrend(
  sightings: readonly Sighting[],
  latestTimestamp: number,
  windowDays: number,
): Trend | null {
  const windowMs = windowDays * 86_400_000;
  const recentStart = latestTimestamp - windowMs;
  const previousStart = recentStart - windowMs;

  let recentCount = 0;
  let previousCount = 0;
  for (const sighting of sightings) {
    if (sighting.timestamp >= recentStart) recentCount += 1;
    else if (sighting.timestamp >= previousStart) previousCount += 1;
  }

  if (recentCount + previousCount < 5) return null;
  if (previousCount === 0) return null;

  const changePercent = Math.round(((recentCount - previousCount) / previousCount) * 100);
  return {
    changePercent,
    direction: changePercent > 2 ? 'up' : changePercent < -2 ? 'down' : 'flat',
    recentCount,
    previousCount,
  };
}

/** The month with the most sightings, for the "peak month" stat tile. */
export function peakMonth(sightings: readonly Sighting[]): MonthlyPoint | null {
  const monthly = monthlyCounts(sightings);
  let best: MonthlyPoint | null = null;
  for (const point of monthly) {
    if (point.count > 0 && (best === null || point.count > best.count)) best = point;
  }
  return best;
}
