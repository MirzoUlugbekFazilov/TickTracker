/**
 * The API contract.
 *
 * These types describe what crosses the wire. The frontend mirrors them in
 * `web/src/types/api.ts`; they are deliberately kept as two files rather than
 * a shared workspace package, because a shared package buys type-safety across
 * one boundary at the cost of build ordering, two extra tsconfigs and a
 * publish step. At this size that trade is not worth it — the contract is
 * small, documented in the README, and exercised end to end.
 */

/** Exactly what the upstream Elanco API returns per record. */
export interface RawSighting {
  id: string;
  /** ISO-8601 local date-time, no timezone designator: `2022-08-01T06:40:31`. */
  date: string;
  location: string;
  species: string;
  latinName: string;
}

export const SEVERITY_LEVELS = ['low', 'moderate', 'high', 'severe'] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

export type SightingSource = 'elanco' | 'user';

/** One component of a severity score, with the reasoning behind it. */
export interface SeverityComponent {
  label: string;
  /** Normalised 0-1 input before weighting. */
  value: number;
  /** Share of the final score this component can contribute. */
  weight: number;
  explanation: string;
}

/** A sighting as served to clients. */
export interface Sighting {
  id: string;
  source: SightingSource;
  /** `YYYY-MM-DD HH:MM:SS`, naive local time, as stored. */
  observedAt: string;
  location: string;
  region: string | null;
  species: string;
  latinName: string;
  /** Display position: city centroid plus a deterministic offset. */
  lat: number;
  lng: number;
  /** The honest, unjittered city position. */
  cityLat: number;
  cityLng: number;
  severityScore: number;
  severityLevel: SeverityLevel;
  severityComponents: SeverityComponent[];
  /** True when the sighting falls in the dataset's most recent window. */
  isRecent: boolean;
  notes: string | null;
  imageAlt: string | null;
  /** True when a photograph is attached; fetch it from the image endpoint. */
  hasImage: boolean;
  reporterName: string | null;
  createdAt: string;
}

/** Counts per value for the current filter context, used by the filter UI. */
export interface Facets {
  species: Record<string, number>;
  severity: Record<SeverityLevel, number>;
  city: Record<string, number>;
}

export interface SightingsResponse {
  data: Sighting[];
  meta: {
    total: number;
    returned: number;
    limit: number;
    offset: number;
  };
  facets: Facets;
}

export interface RegionInsight {
  region: string;
  count: number;
  cities: number;
  /** Mean derived severity score across the region. */
  averageSeverity: number;
}

export interface TrendPoint {
  /** `YYYY-MM-DD`, the first day of the bucket. */
  period: string;
  count: number;
}

export interface SpeciesInsight {
  species: string;
  latinName: string;
  count: number;
  colorSlot: number;
}

export interface SeasonalPoint {
  month: number;
  count: number;
}

export interface SummaryInsight {
  total: number;
  recent: number;
  busiestCity: { name: string; count: number } | null;
  commonestSpecies: { name: string; count: number } | null;
  peakMonth: { month: number; count: number } | null;
  severityCounts: Record<SeverityLevel, number>;
  earliestObserved: string | null;
  latestObserved: string | null;
}

/** Reference data the frontend needs so it does not hard-code anything. */
export interface MetaResponse {
  cities: Array<{ name: string; lat: number; lng: number; region: string }>;
  species: Array<{
    name: string;
    latinName: string;
    genus: string;
    vectorWeight: number;
    colorSlot: number;
  }>;
  severityLevels: readonly SeverityLevel[];
  severityBreakpoints: { moderate: number; high: number; severe: number };
  dateRange: { earliest: string | null; latest: string | null };
  recentWindowDays: number;
  /** Start of the recency window, derived from the newest record. */
  recentSince: string | null;
  totalSightings: number;
  lastIngest: {
    startedAt: string;
    finishedAt: string | null;
    status: string;
    fetched: number;
    inserted: number;
    updated: number;
    rejected: number;
  } | null;
}

/** Every error response from this API has this shape. */
export interface ApiErrorBody {
  error: {
    /** Stable machine-readable code, e.g. `VALIDATION_FAILED`. */
    code: string;
    /** Human-readable, safe to show a user. */
    message: string;
    /** Per-field problems, present on validation failures. */
    details?: Array<{ field: string; message: string }>;
  };
}
