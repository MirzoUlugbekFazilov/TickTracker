/**
 * The client's view of the API contract.
 *
 * These mirror `server/src/types.ts`. They are deliberately a second file
 * rather than a shared workspace package: a shared package would buy
 * compile-time coupling across one boundary at the cost of build ordering, an
 * extra tsconfig and a publish step on every change. At this size the contract
 * is small, documented in the README, and exercised end to end — so the cost
 * outweighs the benefit. If the API grew a second consumer, that trade would
 * flip and the package would be worth extracting.
 *
 * Note what is NOT here any more. Coordinates, severity scores and recency
 * used to be computed in the browser; all three are now derived by the server
 * during ingest and arrive ready to render. The client's job is presentation.
 */

export const SEVERITY_LEVELS = ['low', 'moderate', 'high', 'severe'] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

/** Where a record came from: the Elanco dataset, or a user's report. */
export type SightingSource = 'elanco' | 'user';

export interface SeverityComponent {
  label: string;
  /** Normalised 0-1 input before weighting. */
  value: number;
  /** Share of the final score this component can contribute. */
  weight: number;
  explanation: string;
}

export interface Sighting {
  id: string;
  source: SightingSource;
  /** `YYYY-MM-DD HH:MM:SS`, naive local time as the upstream reports it. */
  observedAt: string;
  location: string;
  region: string | null;
  species: string;
  latinName: string;
  /** Display position: city centroid plus a deterministic server-side offset. */
  lat: number;
  lng: number;
  /** The honest, unjittered city position — used for directions. */
  cityLat: number;
  cityLng: number;
  severityScore: number;
  severityLevel: SeverityLevel;
  severityComponents: SeverityComponent[];
  isRecent: boolean;
  notes: string | null;
  imageAlt: string | null;
  hasImage: boolean;
  reporterName: string | null;
  createdAt: string;
}

/**
 * Parsed timestamp, derived once at the client boundary.
 *
 * The API sends a naive local string so that no timezone is implied anywhere
 * in the stack. `Date.parse` on `YYYY-MM-DD HH:MM:SS` is not reliable across
 * engines, so the separator is normalised to `T` first, which is.
 */
export function sightingTimestamp(sighting: Sighting): number {
  return new Date(sighting.observedAt.replace(' ', 'T')).getTime();
}

export interface Facets {
  species: Record<string, number>;
  severity: Record<SeverityLevel, number>;
  city: Record<string, number>;
}

export interface SightingsResponse {
  data: Sighting[];
  meta: { total: number; returned: number; limit: number; offset: number };
  facets: Facets;
}

/* ------------------------------------------------------------- insights */

export interface RegionInsight {
  region: string;
  count: number;
  cities: number;
  averageSeverity: number;
}

export interface TrendPoint {
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

/* ----------------------------------------------------------- reference */

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

/* ------------------------------------------------------------- filters */

/**
 * Filter state.
 *
 * Sent to the server as query parameters rather than applied in the browser.
 * The empty collections mean "no constraint", which keeps the serialiser
 * simple: an empty set is simply omitted from the query string.
 */
export interface Filters {
  /** Inclusive lower bound, `YYYY-MM-DD`. Empty means no bound. */
  dateFrom: string;
  /** Inclusive upper bound, `YYYY-MM-DD`. Empty means no bound. */
  dateTo: string;
  species: Set<string>;
  severities: Set<SeverityLevel>;
  city: string;
  recentOnly: boolean;
  /** Include sightings reported through this app. */
  includeLocal: boolean;
}

/** Payload for `POST /api/sightings`. */
export interface NewSightingPayload {
  date: string;
  time: string;
  location: string;
  species: string;
  notes?: string;
  imageDataUrl?: string;
  imageAlt?: string;
}
