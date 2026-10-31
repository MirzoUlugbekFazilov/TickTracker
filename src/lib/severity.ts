/**
 * The derived severity / local-risk model.
 *
 * ============================ READ THIS FIRST ============================
 * The Elanco API has NO severity field. The brief asks for markers that carry a
 * severity indicator and for a severity filter, so severity has to come from
 * somewhere — and the only intellectually honest options are (a) invent random
 * values, or (b) compute something defensible from the data that is actually
 * present and tell the user exactly how it was computed.
 *
 * This file does (b). Every sighting gets a 0–100 score from three components,
 * each derived from a real field in the dataset, and the detail panel shows the
 * user the full breakdown. The score describes *modelled local exposure*, not a
 * clinical grading of a case, and the UI never claims otherwise.
 * =========================================================================
 *
 * The three components, and why each one is in the model:
 *
 *   1. Local activity density (50%)
 *      How many other sightings were recorded in the same city within a 45-day
 *      window either side of this one, counted across all years. This is the
 *      strongest signal the dataset genuinely contains: somewhere with repeated
 *      reports at the same point in the season is a place where ticks are
 *      reliably active. Normalised against the busiest city-and-window in the
 *      data, so the scale is relative to this dataset and nothing else.
 *
 *   2. Species vector weight (30%)
 *      A per-species weighting from `src/data/species.ts`, higher for Ixodes
 *      (the genus that transmits Lyme borreliosis in the UK) than for
 *      Dermacentor. Documented as a precautionary genus-level judgement, with
 *      its limits spelled out in that file.
 *
 *   3. Seasonal questing pressure (20%)
 *      UK tick activity is strongly seasonal, peaking in spring and again in
 *      early autumn when nymphs and adults quest. A sighting in May sits in a
 *      higher-exposure part of the year than one in January.
 *
 * HOW THE FOUR LEVELS ARE SET
 * ---------------------------
 * Not with magic constants. Fixed cut-offs were tried first and behaved badly:
 * on the real 1,000 records they put 0.6% of sightings in "low" and 4.4% in
 * "severe", which makes the severity filter almost useless — three of the four
 * options would return nearly nothing.
 *
 * Instead the breakpoints are *quantiles of the dataset's own score
 * distribution*, computed at load time: the lowest-scoring 30% are "low", then
 * 30% "moderate", 25% "high", and the top 15% "severe". This has three
 * advantages. Every level stays populated, so every filter does something. It
 * self-adjusts if Elanco changes the underlying data. And it states plainly what
 * the rating actually is — a sighting's standing *relative to the rest of the
 * dataset* — which is the only claim a derived index of this kind can honestly
 * make.
 */

import type { RawSighting, SeverityBreakdown, SeverityLevel } from '../types/sighting';
import { DEFAULT_VECTOR_WEIGHT, findSpecies } from '../data/species';

const WEIGHT_DENSITY = 0.5;
const WEIGHT_SPECIES = 0.3;
const WEIGHT_SEASON = 0.2;

/** Half-width of the seasonal window used for the density count, in days. */
const DENSITY_WINDOW_DAYS = 45;

/**
 * Relative questing pressure by calendar month (index 0 = January).
 *
 * Shaped on the well-established bimodal UK pattern: a dominant spring peak as
 * nymphs become active, a dip in high summer when hot dry weather suppresses
 * questing, a secondary autumn peak, and a winter trough during which activity
 * falls but does not stop. Values are relative, not absolute densities.
 */
const MONTHLY_QUESTING_PRESSURE = [
  0.15, // Jan
  0.2, // Feb
  0.45, // Mar
  0.75, // Apr
  1.0, // May — spring peak
  0.9, // Jun
  0.65, // Jul
  0.55, // Aug — midsummer dip
  0.75, // Sep
  0.7, // Oct — autumn peak
  0.4, // Nov
  0.2, // Dec
] as const;

export const SEASON_PEAK_MONTHS = 'April to June, with a second rise in September and October';

/**
 * Share of the dataset each level holds, cumulative from the bottom. A
 * sighting is "moderate" once its score passes the 30th percentile, and so on.
 */
const LEVEL_QUANTILES = {
  moderate: 0.3,
  high: 0.6,
  severe: 0.85,
} as const;

/** Score at or above which a sighting earns each level, for one dataset. */
export interface SeverityBreakpoints {
  moderate: number;
  high: number;
  severe: number;
}

export function scoreToLevel(score: number, breakpoints: SeverityBreakpoints): SeverityLevel {
  if (score >= breakpoints.severe) return 'severe';
  if (score >= breakpoints.high) return 'high';
  if (score >= breakpoints.moderate) return 'moderate';
  return 'low';
}

/** Nearest-rank percentile of a pre-sorted ascending array. */
function quantile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const index = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.floor(p * (sortedAsc.length - 1))),
  );
  return sortedAsc[index] ?? 0;
}

/** Day-of-year, 0-based, ignoring leap-year drift (±1 day is immaterial here). */
function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86_400_000);
}

/**
 * Circular distance between two days of the year, in days. Wrapping matters:
 * 28 December and 3 January are six days apart, not 359.
 */
function circularDayDistance(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, 365 - raw);
}

interface DensityIndex {
  /** city -> sorted day-of-year values for every sighting in that city. */
  byCity: Map<string, number[]>;
  /** Largest window count seen anywhere, used to normalise to 0–1. */
  maxWindowCount: number;
}

/**
 * Builds the density index once per dataset rather than per sighting. Done
 * naively this is O(n²); with 1,000 records that is a million cheap integer
 * comparisons, which is fine, but the per-city split reduces it to the sum of
 * squares of the city sizes — around 75,000 comparisons in practice.
 */
function buildDensityIndex(sightings: readonly RawSighting[]): DensityIndex {
  const byCity = new Map<string, number[]>();

  for (const sighting of sightings) {
    const parsed = new Date(sighting.date);
    if (Number.isNaN(parsed.getTime())) continue;
    const key = sighting.location.toLowerCase();
    const days = byCity.get(key);
    if (days) {
      days.push(dayOfYear(parsed));
    } else {
      byCity.set(key, [dayOfYear(parsed)]);
    }
  }

  let maxWindowCount = 1;
  for (const days of byCity.values()) {
    for (const day of days) {
      let count = 0;
      for (const other of days) {
        if (circularDayDistance(day, other) <= DENSITY_WINDOW_DAYS) count += 1;
      }
      if (count > maxWindowCount) maxWindowCount = count;
    }
  }

  return { byCity, maxWindowCount };
}

function windowCount(index: DensityIndex, location: string, day: number): number {
  const days = index.byCity.get(location.toLowerCase());
  if (!days) return 1;
  let count = 0;
  for (const other of days) {
    if (circularDayDistance(day, other) <= DENSITY_WINDOW_DAYS) count += 1;
  }
  return count;
}

/**
 * A reusable scorer bound to one dataset. Returned as a closure so locally
 * reported sightings can be scored on exactly the same basis as API records,
 * against the same normalisation constants.
 */
export interface SeverityScorer {
  /** Full breakdown, including the level assigned against this dataset. */
  score(input: SeverityInput): SeverityBreakdown;
  /** Dataset-relative level boundaries, exposed for the methodology panel. */
  readonly breakpoints: SeverityBreakpoints;
  /** Busiest city-and-window count, the density normaliser. */
  readonly maxWindowCount: number;
}

export type SeverityInput = Pick<RawSighting, 'date' | 'location' | 'species'>;

export function createSeverityScorer(sightings: readonly RawSighting[]): SeverityScorer {
  const index = buildDensityIndex(sightings);

  /** The raw 0–100 score and its components, before a level is assigned. */
  const rawScore = (
    input: SeverityInput,
  ): { score: number; components: SeverityBreakdown['components'] } => {
    const parsed = new Date(input.date);
    const valid = !Number.isNaN(parsed.getTime());
    const day = valid ? dayOfYear(parsed) : 0;
    const month = valid ? parsed.getMonth() : 0;

    const count = windowCount(index, input.location, day);
    // Clamped because a locally reported sighting can push a city past the
    // index's maximum, which would otherwise yield a density above 1.
    const density = clamp01(count / index.maxWindowCount);

    const speciesInfo = findSpecies(input.species);
    const speciesWeight = speciesInfo?.vectorWeight ?? DEFAULT_VECTOR_WEIGHT;
    const seasonal = MONTHLY_QUESTING_PRESSURE[month] ?? 0.5;

    const score = Math.round(
      100 *
        (density * WEIGHT_DENSITY +
          speciesWeight * WEIGHT_SPECIES +
          seasonal * WEIGHT_SEASON),
    );

    return {
      score,
      components: [
        {
          label: 'Local activity density',
          value: density,
          weight: WEIGHT_DENSITY,
          explanation: `${count} ${
            count === 1 ? 'sighting' : 'sightings'
          } recorded in ${input.location} within ${DENSITY_WINDOW_DAYS} days of this point in the year, counted across every year in the dataset. The busiest city-and-window in the data holds ${index.maxWindowCount}.`,
        },
        {
          label: 'Species vector weight',
          value: speciesWeight,
          weight: WEIGHT_SPECIES,
          explanation:
            speciesInfo?.vectorNote ??
            'No reference entry for this species, so the model applies a neutral mid-range weight.',
        },
        {
          label: 'Seasonal questing pressure',
          value: seasonal,
          weight: WEIGHT_SEASON,
          // Not lower-cased: the constant contains proper month names, and
          // folding the whole string would render them as "april to june".
          explanation: `${MONTH_NAMES[month] ?? 'This month'} sits at ${Math.round(
            seasonal * 100,
          )}% of the annual peak on the bimodal UK activity curve, which peaks in ${SEASON_PEAK_MONTHS}.`,
        },
      ],
    };
  };

  // First pass: score the whole dataset so the level boundaries can be read off
  // its own distribution rather than hard-coded.
  const distribution = sightings.map((sighting) => rawScore(sighting).score).sort((a, b) => a - b);

  const breakpoints: SeverityBreakpoints = {
    moderate: quantile(distribution, LEVEL_QUANTILES.moderate),
    high: quantile(distribution, LEVEL_QUANTILES.high),
    severe: quantile(distribution, LEVEL_QUANTILES.severe),
  };

  return {
    breakpoints,
    maxWindowCount: index.maxWindowCount,
    score(input) {
      const { score, components } = rawScore(input);
      return { score, level: scoreToLevel(score, breakpoints), components };
    },
  };
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

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

/** The model description shown in the UI's methodology disclosure. */
export const SEVERITY_METHODOLOGY = {
  windowDays: DENSITY_WINDOW_DAYS,
  weights: {
    density: WEIGHT_DENSITY,
    species: WEIGHT_SPECIES,
    season: WEIGHT_SEASON,
  },
  quantiles: LEVEL_QUANTILES,
  /** Share of the dataset each level is designed to hold. */
  levelShares: {
    low: LEVEL_QUANTILES.moderate,
    moderate: LEVEL_QUANTILES.high - LEVEL_QUANTILES.moderate,
    high: LEVEL_QUANTILES.severe - LEVEL_QUANTILES.high,
    severe: 1 - LEVEL_QUANTILES.severe,
  },
} as const;
