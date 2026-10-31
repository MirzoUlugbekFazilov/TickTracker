/**
 * Turns raw API records and local reports into the single `Sighting` shape the
 * UI renders, and computes the dataset-level facts the UI needs alongside them.
 */

import type {
  LocalReport,
  RawSighting,
  Sighting,
  SeverityLevel,
} from '../types/sighting';
import { SEVERITY_LEVELS } from '../types/sighting';
import { createSeverityScorer, type SeverityBreakpoints } from './severity';
import { resolvePosition } from './geo';
import { findSpecies } from '../data/species';

/**
 * Width of the "recent activity" window, in days.
 *
 * Measured back from the newest date *in the dataset*, not from today. The
 * dataset ends in December 2024, so anchoring recency to the real clock would
 * mark every single record as stale and the recency indicator would convey
 * nothing. Anchoring to the data keeps the indicator meaningful, and the UI
 * labels it explicitly as "the most recent 90 days of available data" so the
 * user is never misled into thinking it means the last 90 days from now.
 */
export const RECENT_WINDOW_DAYS = 90;

export interface Dataset {
  sightings: Sighting[];
  /** Newest timestamp in the data, the anchor for the recency window. */
  latestTimestamp: number;
  /** Oldest timestamp in the data. */
  earliestTimestamp: number;
  /** Start of the recency window, in ms. */
  recentSince: number;
  /** Dataset-relative severity boundaries, for the methodology panel. */
  breakpoints: SeverityBreakpoints;
  maxWindowCount: number;
  /** Distinct species names present in the data, alphabetical. */
  speciesPresent: string[];
  /** Distinct city names present in the data, alphabetical. */
  citiesPresent: string[];
  /** Distinct years present in the data, ascending. */
  yearsPresent: number[];
  /** Count per severity level across the whole dataset. */
  severityCounts: Record<SeverityLevel, number>;
}

/**
 * The API returns date-times with no timezone designator
 * (`2022-08-01T06:40:31`). `new Date()` reads those as *local* time, which is
 * what we want: a tick seen at 06:40 was seen at 06:40 wherever the reader is,
 * and treating it as UTC would shift British summer sightings by an hour and
 * occasionally across a date boundary.
 */
function parseTimestamp(date: string): number {
  return new Date(date).getTime();
}

/**
 * Builds the enriched dataset. Takes both API records and local reports so that
 * every sighting is scored against the same density index and the same
 * dataset-relative severity boundaries — scoring them separately would make a
 * locally reported sighting's rating incomparable to the ones around it.
 */
export function buildDataset(
  raw: readonly RawSighting[],
  localReports: readonly LocalReport[] = [],
): Dataset {
  const localAsRaw: RawSighting[] = localReports.map(localReportToRaw);
  const scorer = createSeverityScorer([...raw, ...localAsRaw]);

  const combined: Array<{ record: RawSighting; source: 'api' | 'local'; report?: LocalReport }> = [
    ...raw.map((record) => ({ record, source: 'api' as const })),
    ...localReports.map((report) => ({
      record: localReportToRaw(report),
      source: 'local' as const,
      report,
    })),
  ];

  // Recency is relative to the newest record, so the window has to be known
  // before any sighting can be flagged.
  let latestTimestamp = Number.NEGATIVE_INFINITY;
  let earliestTimestamp = Number.POSITIVE_INFINITY;
  for (const { record } of combined) {
    const timestamp = parseTimestamp(record.date);
    if (Number.isNaN(timestamp)) continue;
    if (timestamp > latestTimestamp) latestTimestamp = timestamp;
    if (timestamp < earliestTimestamp) earliestTimestamp = timestamp;
  }
  if (!Number.isFinite(latestTimestamp)) latestTimestamp = Date.now();
  if (!Number.isFinite(earliestTimestamp)) earliestTimestamp = latestTimestamp;

  const recentSince = latestTimestamp - RECENT_WINDOW_DAYS * 86_400_000;

  const sightings: Sighting[] = [];
  const severityCounts: Record<SeverityLevel, number> = {
    low: 0,
    moderate: 0,
    high: 0,
    severe: 0,
  };
  const speciesSet = new Set<string>();
  const citySet = new Set<string>();
  const yearSet = new Set<number>();

  for (const { record, source, report } of combined) {
    const timestamp = parseTimestamp(record.date);
    if (Number.isNaN(timestamp)) continue; // Drop unparseable rows rather than plot NaN.

    const position = resolvePosition(record.location, record.id);
    const breakdown = scorer.score(record);

    const sighting: Sighting = {
      id: record.id,
      date: record.date,
      timestamp,
      location: record.location,
      species: record.species,
      latinName: record.latinName,
      lat: position.lat,
      lng: position.lng,
      cityLat: position.cityLat,
      cityLng: position.cityLng,
      severity: breakdown.level,
      severityScore: breakdown.score,
      severityBreakdown: breakdown,
      isRecent: timestamp >= recentSince,
      source,
      ...(report?.notes ? { notes: report.notes } : {}),
      ...(report?.imageDataUrl ? { imageDataUrl: report.imageDataUrl } : {}),
      ...(report?.imageAlt ? { imageAlt: report.imageAlt } : {}),
    };

    sightings.push(sighting);
    severityCounts[breakdown.level] += 1;
    speciesSet.add(record.species);
    citySet.add(record.location);
    yearSet.add(new Date(timestamp).getFullYear());
  }

  // Newest first: the detail panel's timeline and the "latest sightings" list
  // both want this order, and sorting once here avoids re-sorting per render.
  sightings.sort((a, b) => b.timestamp - a.timestamp);

  return {
    sightings,
    latestTimestamp,
    earliestTimestamp,
    recentSince,
    breakpoints: scorer.breakpoints,
    maxWindowCount: scorer.maxWindowCount,
    speciesPresent: [...speciesSet].sort((a, b) => a.localeCompare(b, 'en-GB')),
    citiesPresent: [...citySet].sort((a, b) => a.localeCompare(b, 'en-GB')),
    yearsPresent: [...yearSet].sort((a, b) => a - b),
    severityCounts,
  };
}

/** Projects a stored local report onto the API's record shape. */
export function localReportToRaw(report: LocalReport): RawSighting {
  return {
    id: report.id,
    // `YYYY-MM-DDTHH:MM:SS`, matching the API's format exactly so every
    // downstream date routine can stay unaware of where a record came from.
    date: `${report.date}T${report.time}:00`,
    location: report.location,
    species: report.species,
    latinName: report.latinName || findSpecies(report.species)?.latinName || '',
  };
}

export const ALL_SEVERITIES: readonly SeverityLevel[] = SEVERITY_LEVELS;
