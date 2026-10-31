/**
 * Domain types for TickTrack UK.
 *
 * The Elanco API returns a deliberately small record. Everything the map needs
 * beyond those five fields (coordinates, severity, recency) is derived on the
 * client — see `src/lib/geo.ts` and `src/lib/severity.ts`. Keeping the raw and
 * enriched shapes as separate types makes that boundary explicit: if a field is
 * on `RawSighting` it came from the API, if it is only on `Sighting` we worked
 * it out ourselves.
 */

/** Exactly the shape returned by `GET /data/tick-sightings`. */
export interface RawSighting {
  id: string;
  /** ISO-8601 local date-time, e.g. `2022-08-01T06:40:31` (no timezone suffix). */
  date: string;
  /** UK city name, e.g. `Manchester`. One of 14 values in the dataset. */
  location: string;
  /** Common name, e.g. `Marsh tick`. */
  species: string;
  /** Binomial name, e.g. `Ixodes apronophorus`. */
  latinName: string;
}

export const SEVERITY_LEVELS = ['low', 'moderate', 'high', 'severe'] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

/** Where a record came from — API dataset, or reported by this browser. */
export type SightingSource = 'api' | 'local';

/**
 * A breakdown of how a severity score was reached, shown to the user in the
 * detail panel. We surface this because the score is modelled, not measured.
 */
export interface SeverityBreakdown {
  /** 0–100 overall score. */
  score: number;
  level: SeverityLevel;
  components: Array<{
    label: string;
    /** 0–1 normalised contribution before weighting. */
    value: number;
    /** Share of the final score this component can contribute. */
    weight: number;
    explanation: string;
  }>;
}

/** An API or locally reported sighting, enriched for display. */
export interface Sighting {
  id: string;
  /** Original ISO string from the API, or the composed value for local reports. */
  date: string;
  /** Parsed timestamp in ms, for cheap range comparisons. */
  timestamp: number;
  location: string;
  species: string;
  latinName: string;
  /** City centroid plus deterministic offset — see `src/lib/geo.ts`. */
  lat: number;
  lng: number;
  /** City centroid, unjittered — used for "get directions" and area grouping. */
  cityLat: number;
  cityLng: number;
  severity: SeverityLevel;
  severityScore: number;
  severityBreakdown: SeverityBreakdown;
  /** True when the sighting falls in the most recent window of the dataset. */
  isRecent: boolean;
  source: SightingSource;
  /** Only present on locally reported sightings. */
  notes?: string;
  /** Data URL of an uploaded photograph, local reports only. */
  imageDataUrl?: string;
  imageAlt?: string;
}

/** A sighting submitted through the report form and held in localStorage. */
export interface LocalReport {
  id: string;
  /** `YYYY-MM-DD` as entered. */
  date: string;
  /** `HH:MM` as entered. */
  time: string;
  location: string;
  species: string;
  latinName: string;
  notes?: string;
  imageDataUrl?: string;
  imageAlt?: string;
  /** When the report was saved, ISO-8601. */
  submittedAt: string;
}

export interface Filters {
  /** Inclusive lower bound, `YYYY-MM-DD`. Empty string means "no bound". */
  dateFrom: string;
  /** Inclusive upper bound, `YYYY-MM-DD`. Empty string means "no bound". */
  dateTo: string;
  /** Empty set means "all species". */
  species: Set<string>;
  /** Empty set means "all severities". */
  severities: Set<SeverityLevel>;
  /** Empty string means "all cities". */
  city: string;
  /** Restrict to the most recent window of the dataset. */
  recentOnly: boolean;
  /** Include sightings reported from this browser. */
  includeLocal: boolean;
}

export interface ApiStats {
  api_version: string;
  total_sightings: number;
}
