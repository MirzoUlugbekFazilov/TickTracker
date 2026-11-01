/**
 * Data access for sightings.
 *
 * All SQL lives here rather than in route handlers, so the routes stay about
 * HTTP (parse, validate, respond) and the queries stay reviewable in one file.
 *
 * ON PARAMETERISATION
 * Every user-supplied value is a bound parameter — there is no string
 * interpolation of input anywhere in this file, including in the dynamic
 * WHERE clause, which is built by pushing `$n` placeholders alongside the
 * values they refer to. That is the only safe way to build a filter whose
 * shape varies at runtime.
 */

import { query } from './pool.js';
import { SEVERITY_LEVELS } from '../types.js';
import type {
  Facets,
  RegionInsight,
  SeasonalPoint,
  SeverityLevel,
  Sighting,
  SpeciesInsight,
  SummaryInsight,
  TrendPoint,
} from '../types.js';
import {
  SEVERITY_METHODOLOGY,
  MONTH_NAMES,
  SEASON_PEAK_MONTHS,
  createSeverityScorer,
} from '../domain/severity.js';
import { findSpecies } from '../domain/species.js';
import { findCity } from '../domain/cities.js';
import { resolvePosition } from '../domain/geo.js';
import { AppError } from '../lib/errors.js';
import { randomUUID } from 'node:crypto';

/* ------------------------------------------------------------- filtering */

export interface SightingFilters {
  from?: string | undefined;
  to?: string | undefined;
  city?: string | undefined;
  species?: string[] | undefined;
  severity?: SeverityLevel[] | undefined;
  source?: 'elanco' | 'user' | undefined;
  recentOnly?: boolean | undefined;
}

interface WhereClause {
  sql: string;
  params: unknown[];
}

/**
 * Builds the shared WHERE clause.
 *
 * `recentSince` is passed in rather than computed here because the recency
 * window is anchored to the newest record in the dataset, not to the wall
 * clock — the data ends in 2024, so "last 90 days from now" would match
 * nothing at all.
 */
/** A filter dimension that can be left out when building a WHERE clause. */
type FilterDimension = 'species' | 'severity' | 'city';

function buildWhere(
  filters: SightingFilters,
  recentSince: string | null,
  /**
   * Dimension to omit, for faceted counting.
   *
   * A facet must answer "how many would I get if I ALSO selected this", which
   * means excluding its own dimension from the filter. Counting facets against
   * the fully filtered set instead produces the classic faceted-search bug:
   * tick "Severe" and every other severity reports 0, which makes the
   * remaining options look unavailable when in fact they would widen the
   * result. Date and source stay applied throughout — they are context, not
   * the dimension being offered.
   */
  exclude?: FilterDimension,
): WhereClause {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    conditions.push(sql.replace('$?', `$${params.length}`));
  };

  if (filters.from) add('s.observed_at >= $?', `${filters.from} 00:00:00`);
  // End of day, so an inclusive upper bound actually includes that day —
  // the off-by-one that otherwise hides a full day of results.
  if (filters.to) add('s.observed_at <= $?', `${filters.to} 23:59:59`);
  if (filters.city && exclude !== 'city') add('s.location = $?', filters.city);
  if (filters.species?.length && exclude !== 'species') {
    add('s.species = ANY($?)', filters.species);
  }
  if (filters.severity?.length && exclude !== 'severity') {
    add('s.severity_level = ANY($?)', filters.severity);
  }
  if (filters.source) add('s.source = $?', filters.source);
  if (filters.recentOnly && recentSince) add('s.observed_at >= $?', recentSince);

  return {
    sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

/* ------------------------------------------------------------ row shape */

interface SightingRow {
  id: string;
  source: 'elanco' | 'user';
  observed_at: string;
  location: string;
  region: string | null;
  species: string;
  latin_name: string;
  lat: number;
  lng: number;
  city_lat: number;
  city_lng: number;
  severity_score: number;
  severity_level: SeverityLevel;
  density_component: number;
  species_component: number;
  season_component: number;
  notes: string | null;
  image_alt: string | null;
  has_image: boolean;
  reporter_name: string | null;
  created_at: Date;
  is_recent: boolean;
}

/**
 * Maps a row to the wire shape, rebuilding the human-readable explanation of
 * each severity component.
 *
 * The explanations are regenerated here rather than stored, because they
 * reference dataset-wide facts (the busiest window count, the season curve)
 * that change on every ingest. Storing them would mean 1,000 rows of prose to
 * rewrite each time.
 */
function toSighting(row: SightingRow, maxWindowCount: number): Sighting {
  const month = Number(row.observed_at.slice(5, 7)) - 1;
  const approxWindowCount = Math.round(row.density_component * maxWindowCount);
  const speciesInfo = findSpecies(row.species);

  return {
    id: row.id,
    source: row.source,
    observedAt: row.observed_at,
    location: row.location,
    region: row.region,
    species: row.species,
    latinName: row.latin_name,
    lat: Number(row.lat),
    lng: Number(row.lng),
    cityLat: Number(row.city_lat),
    cityLng: Number(row.city_lng),
    severityScore: row.severity_score,
    severityLevel: row.severity_level,
    severityComponents: [
      {
        label: 'Local activity density',
        value: Number(row.density_component),
        weight: SEVERITY_METHODOLOGY.weights.density,
        explanation:
          `About ${approxWindowCount} ${approxWindowCount === 1 ? 'sighting' : 'sightings'} ` +
          `recorded in ${row.location} within ${SEVERITY_METHODOLOGY.windowDays} days of this ` +
          `point in the year, counted across every year in the dataset. The busiest ` +
          `city-and-window holds ${maxWindowCount}.`,
      },
      {
        label: 'Species vector weight',
        value: Number(row.species_component),
        weight: SEVERITY_METHODOLOGY.weights.species,
        explanation:
          speciesInfo?.vectorNote ??
          'No reference entry for this species, so the model applies a neutral mid-range weight.',
      },
      {
        label: 'Seasonal questing pressure',
        value: Number(row.season_component),
        weight: SEVERITY_METHODOLOGY.weights.season,
        explanation:
          `${MONTH_NAMES[month] ?? 'This month'} sits at ` +
          `${Math.round(Number(row.season_component) * 100)}% of the annual peak on the ` +
          `bimodal UK activity curve, which peaks in ${SEASON_PEAK_MONTHS}.`,
      },
    ],
    isRecent: row.is_recent,
    notes: row.notes,
    imageAlt: row.image_alt,
    hasImage: row.has_image,
    reporterName: row.reporter_name,
    createdAt: row.created_at.toISOString(),
  };
}

/* ------------------------------------------------------------- metadata */

export interface DatasetMeta {
  breakpoints: { moderate: number; high: number; severe: number };
  maxWindowCount: number;
  earliestObserved: string | null;
  latestObserved: string | null;
  recentSince: string | null;
}

export const RECENT_WINDOW_DAYS = 90;

export async function getDatasetMeta(): Promise<DatasetMeta> {
  const { rows } = await query<{
    breakpoint_moderate: number;
    breakpoint_high: number;
    breakpoint_severe: number;
    max_window_count: number;
    earliest_observed: string | null;
    latest_observed: string | null;
    recent_since: string | null;
  }>(
    `SELECT breakpoint_moderate, breakpoint_high, breakpoint_severe,
            max_window_count, earliest_observed, latest_observed,
            to_char(latest_observed - ($1 || ' days')::interval,
                    'YYYY-MM-DD HH24:MI:SS') AS recent_since
       FROM dataset_meta WHERE id = 1`,
    [RECENT_WINDOW_DAYS],
  );

  const row = rows[0];
  return {
    breakpoints: {
      moderate: row?.breakpoint_moderate ?? 0,
      high: row?.breakpoint_high ?? 0,
      severe: row?.breakpoint_severe ?? 0,
    },
    maxWindowCount: row?.max_window_count ?? 1,
    earliestObserved: row?.earliest_observed ?? null,
    latestObserved: row?.latest_observed ?? null,
    recentSince: row?.recent_since ?? null,
  };
}

/* ------------------------------------------------------------- queries */

const SELECT_COLUMNS = `
  s.id, s.source, to_char(s.observed_at, 'YYYY-MM-DD HH24:MI:SS') AS observed_at,
  s.location, c.region, s.species, s.latin_name,
  s.lat, s.lng, s.city_lat, s.city_lng,
  s.severity_score, s.severity_level,
  s.density_component, s.species_component, s.season_component,
  s.notes, s.image_alt, (s.image_data IS NOT NULL) AS has_image,
  s.reporter_name, s.created_at,
  (s.observed_at >= $RECENT) AS is_recent
`;

export interface FindResult {
  data: Sighting[];
  total: number;
  facets: Facets;
}

export async function findSightings(
  filters: SightingFilters,
  limit: number,
  offset: number,
): Promise<FindResult> {
  const meta = await getDatasetMeta();
  const where = buildWhere(filters, meta.recentSince);

  // The recency cutoff is appended as the last parameter so SELECT_COLUMNS can
  // reference it by position without colliding with the filter parameters.
  const recentParamIndex = where.params.length + 1;
  const selectColumns = SELECT_COLUMNS.replace('$RECENT', `$${recentParamIndex}`);
  const dataParams = [...where.params, meta.recentSince ?? '1970-01-01'];

  const [dataResult, countResult, facetResult] = await Promise.all([
    query<SightingRow>(
      `SELECT ${selectColumns}
         FROM sightings s
         LEFT JOIN cities c ON c.name = s.location
         ${where.sql}
        ORDER BY s.observed_at DESC
        LIMIT $${dataParams.length + 1} OFFSET $${dataParams.length + 2}`,
      [...dataParams, limit, offset],
    ),

    query<{ count: string }>(
      `SELECT count(*)::text AS count FROM sightings s ${where.sql}`,
      where.params,
    ),

    // Facets.
    //
    // Each dimension is counted with its OWN filter excluded (see buildWhere),
    // so the numbers answer "how many would I get if I also picked this"
    // rather than "how many of the current results have this value".
    //
    // That means three different WHERE clauses and therefore three different
    // parameter lists, which is why this is three queries rather than one
    // UNION — a single statement would need one shared parameter list, and
    // the clauses no longer share one. Three indexed aggregates in parallel
    // is a cheaper trade than the wrong numbers.
    (async () => {
      const speciesWhere = buildWhere(filters, meta.recentSince, 'species');
      const severityWhere = buildWhere(filters, meta.recentSince, 'severity');
      const cityWhere = buildWhere(filters, meta.recentSince, 'city');

      const [species, severity, city] = await Promise.all([
        query<{ key: string; count: string }>(
          `SELECT s.species AS key, count(*)::text AS count
             FROM sightings s ${speciesWhere.sql} GROUP BY s.species`,
          speciesWhere.params,
        ),
        query<{ key: string; count: string }>(
          `SELECT s.severity_level AS key, count(*)::text AS count
             FROM sightings s ${severityWhere.sql} GROUP BY s.severity_level`,
          severityWhere.params,
        ),
        query<{ key: string; count: string }>(
          `SELECT s.location AS key, count(*)::text AS count
             FROM sightings s ${cityWhere.sql} GROUP BY s.location`,
          cityWhere.params,
        ),
      ]);

      return { species: species.rows, severity: severity.rows, city: city.rows };
    })(),
  ]);

  const facets: Facets = {
    species: {},
    severity: { low: 0, moderate: 0, high: 0, severe: 0 },
    city: {},
  };

  for (const row of facetResult.species) facets.species[row.key] = Number(row.count);
  for (const row of facetResult.city) facets.city[row.key] = Number(row.count);
  for (const row of facetResult.severity) {
    if (isSeverityLevel(row.key)) facets.severity[row.key] = Number(row.count);
  }

  return {
    data: dataResult.rows.map((row) => toSighting(row, meta.maxWindowCount)),
    total: Number(countResult.rows[0]?.count ?? 0),
    facets,
  };
}

function isSeverityLevel(value: string): value is SeverityLevel {
  return (SEVERITY_LEVELS as readonly string[]).includes(value);
}

export async function findSightingById(id: string): Promise<Sighting | null> {
  const meta = await getDatasetMeta();
  const { rows } = await query<SightingRow>(
    `SELECT ${SELECT_COLUMNS.replace('$RECENT', '$2')}
       FROM sightings s
       LEFT JOIN cities c ON c.name = s.location
      WHERE s.id = $1`,
    [id, meta.recentSince ?? '1970-01-01'],
  );

  const row = rows[0];
  return row ? toSighting(row, meta.maxWindowCount) : null;
}

export async function findSightingImage(
  id: string,
): Promise<{ data: string; alt: string | null } | null> {
  const { rows } = await query<{ image_data: string | null; image_alt: string | null }>(
    'SELECT image_data, image_alt FROM sightings WHERE id = $1',
    [id],
  );
  const row = rows[0];
  if (!row?.image_data) return null;
  return { data: row.image_data, alt: row.image_alt };
}

/* ------------------------------------------------------------ insights */

export async function insightsByRegion(
  filters: SightingFilters,
): Promise<RegionInsight[]> {
  const meta = await getDatasetMeta();
  const where = buildWhere(filters, meta.recentSince);

  const { rows } = await query<{
    region: string;
    count: string;
    cities: string;
    average_severity: string;
  }>(
    `SELECT COALESCE(c.region, 'Unknown') AS region,
            count(*)::text                AS count,
            count(DISTINCT s.location)::text AS cities,
            round(avg(s.severity_score)::numeric, 1)::text AS average_severity
       FROM sightings s
       LEFT JOIN cities c ON c.name = s.location
       ${where.sql}
      GROUP BY COALESCE(c.region, 'Unknown')
      ORDER BY count(*) DESC`,
    where.params,
  );

  return rows.map((row) => ({
    region: row.region,
    count: Number(row.count),
    cities: Number(row.cities),
    averageSeverity: Number(row.average_severity),
  }));
}

export async function insightsTrend(
  filters: SightingFilters,
  interval: 'week' | 'month' | 'year',
): Promise<TrendPoint[]> {
  const meta = await getDatasetMeta();
  const where = buildWhere(filters, meta.recentSince);

  // `interval` is validated against a whitelist by the route before it gets
  // here, so interpolating it into date_trunc is safe. It cannot be a bound
  // parameter: date_trunc's first argument must be a literal.
  const { rows } = await query<{ period: string; count: string }>(
    `SELECT to_char(date_trunc('${interval}', s.observed_at), 'YYYY-MM-DD') AS period,
            count(*)::text AS count
       FROM sightings s
       ${where.sql}
      GROUP BY date_trunc('${interval}', s.observed_at)
      ORDER BY date_trunc('${interval}', s.observed_at)`,
    where.params,
  );

  return rows.map((row) => ({ period: row.period, count: Number(row.count) }));
}

export async function insightsBySpecies(
  filters: SightingFilters,
): Promise<SpeciesInsight[]> {
  const meta = await getDatasetMeta();
  const where = buildWhere(filters, meta.recentSince);

  const { rows } = await query<{
    species: string;
    latin_name: string;
    color_slot: number | null;
    count: string;
  }>(
    `SELECT s.species,
            max(s.latin_name) AS latin_name,
            max(sp.color_slot) AS color_slot,
            count(*)::text AS count
       FROM sightings s
       LEFT JOIN species sp ON sp.name = s.species
       ${where.sql}
      GROUP BY s.species
      ORDER BY count(*) DESC`,
    where.params,
  );

  return rows.map((row) => ({
    species: row.species,
    latinName: row.latin_name,
    count: Number(row.count),
    colorSlot: row.color_slot ?? 1,
  }));
}

/** Sightings per calendar month, for the seasonal chart. */
export async function insightsSeasonal(
  filters: SightingFilters,
): Promise<SeasonalPoint[]> {
  const meta = await getDatasetMeta();
  const where = buildWhere(filters, meta.recentSince);

  const { rows } = await query<{ month: string; count: string }>(
    `SELECT extract(month FROM s.observed_at)::int::text AS month,
            count(*)::text AS count
       FROM sightings s
       ${where.sql}
      GROUP BY extract(month FROM s.observed_at)
      ORDER BY extract(month FROM s.observed_at)`,
    where.params,
  );

  // Always return twelve months. A month with no sightings is a real fact and
  // dropping it would compress the chart's axis and hide a quiet January.
  const counts = new Map(rows.map((row) => [Number(row.month), Number(row.count)]));
  return Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    count: counts.get(index + 1) ?? 0,
  }));
}

export async function insightsSummary(
  filters: SightingFilters,
): Promise<SummaryInsight> {
  const meta = await getDatasetMeta();
  const where = buildWhere(filters, meta.recentSince);
  const recentSince = meta.recentSince ?? '1970-01-01';

  const { rows } = await query<{
    total: string;
    recent: string;
    low: string;
    moderate: string;
    high: string;
    severe: string;
    earliest: string | null;
    latest: string | null;
  }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE s.observed_at >= $${where.params.length + 1})::text AS recent,
            count(*) FILTER (WHERE s.severity_level = 'low')::text      AS low,
            count(*) FILTER (WHERE s.severity_level = 'moderate')::text AS moderate,
            count(*) FILTER (WHERE s.severity_level = 'high')::text     AS high,
            count(*) FILTER (WHERE s.severity_level = 'severe')::text   AS severe,
            to_char(min(s.observed_at), 'YYYY-MM-DD HH24:MI:SS') AS earliest,
            to_char(max(s.observed_at), 'YYYY-MM-DD HH24:MI:SS') AS latest
       FROM sightings s ${where.sql}`,
    [...where.params, recentSince],
  );

  const [cities, species, seasonal] = await Promise.all([
    query<{ location: string; count: string }>(
      `SELECT s.location, count(*)::text AS count FROM sightings s ${where.sql}
        GROUP BY s.location ORDER BY count(*) DESC LIMIT 1`,
      where.params,
    ),
    query<{ species: string; count: string }>(
      `SELECT s.species, count(*)::text AS count FROM sightings s ${where.sql}
        GROUP BY s.species ORDER BY count(*) DESC LIMIT 1`,
      where.params,
    ),
    insightsSeasonal(filters),
  ]);

  const row = rows[0];
  const topCity = cities.rows[0];
  const topSpecies = species.rows[0];
  const peak = seasonal.reduce<SeasonalPoint | null>(
    (best, point) => (point.count > 0 && (best === null || point.count > best.count) ? point : best),
    null,
  );

  return {
    total: Number(row?.total ?? 0),
    recent: Number(row?.recent ?? 0),
    busiestCity: topCity ? { name: topCity.location, count: Number(topCity.count) } : null,
    commonestSpecies: topSpecies
      ? { name: topSpecies.species, count: Number(topSpecies.count) }
      : null,
    peakMonth: peak ? { month: peak.month, count: peak.count } : null,
    severityCounts: {
      low: Number(row?.low ?? 0),
      moderate: Number(row?.moderate ?? 0),
      high: Number(row?.high ?? 0),
      severe: Number(row?.severe ?? 0),
    },
    earliestObserved: row?.earliest ?? null,
    latestObserved: row?.latest ?? null,
  };
}

/* -------------------------------------------------------------- creation */

export interface NewSightingInput {
  date: string;
  time: string;
  location: string;
  species: string;
  notes?: string | undefined;
  imageDataUrl?: string | undefined;
  imageAlt?: string | undefined;
  reporterName?: string | undefined;
}

/**
 * Inserts a user-submitted report.
 *
 * The report is scored on exactly the same basis as upstream records: the
 * scorer is rebuilt over the existing dataset so the new sighting's density
 * component is measured against real neighbours, and its level is assigned
 * from the stored breakpoints. Scoring it in isolation would produce a rating
 * that is not comparable with the ones around it on the map.
 *
 * The id is generated server-side. Accepting a client-supplied id would let a
 * caller overwrite an existing record via the upsert path.
 */
export async function createSighting(input: NewSightingInput): Promise<Sighting> {
  const city = findCity(input.location);
  if (!city) {
    throw AppError.validation('That location is not one we can place on the map.', [
      { field: 'location', message: 'Choose one of the listed UK cities.' },
    ]);
  }

  const id = `user-${randomUUID()}`;
  const observedAt = `${input.date} ${input.time}:00`;
  const position = resolvePosition(input.location, id);
  const reference = findSpecies(input.species);

  // Score against the current dataset, including other user reports.
  const { rows: existing } = await query<{
    id: string;
    date: string;
    location: string;
    species: string;
  }>(
    `SELECT id, to_char(observed_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS date, location, species
       FROM sightings`,
  );

  const candidate = {
    id,
    date: `${input.date}T${input.time}:00`,
    location: input.location,
    species: input.species,
    latinName: reference?.latinName ?? '',
  };

  const scorer = createSeverityScorer([
    ...existing.map((row) => ({ ...row, latinName: '' })),
    candidate,
  ]);
  const breakdown = scorer.score(candidate);

  const meta = await getDatasetMeta();
  const level: SeverityLevel =
    breakdown.score >= meta.breakpoints.severe
      ? 'severe'
      : breakdown.score >= meta.breakpoints.high
        ? 'high'
        : breakdown.score >= meta.breakpoints.moderate
          ? 'moderate'
          : 'low';

  await query(
    `INSERT INTO sightings (
       id, source, observed_at, location, species, latin_name,
       lat, lng, city_lat, city_lng,
       severity_score, severity_level,
       density_component, species_component, season_component,
       notes, image_data, image_alt, reporter_name
     ) VALUES ($1,'user',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      id,
      observedAt,
      input.location,
      input.species,
      reference?.latinName ?? '',
      position.lat,
      position.lng,
      position.cityLat,
      position.cityLng,
      breakdown.score,
      level,
      breakdown.components[0]?.value ?? 0,
      breakdown.components[1]?.value ?? 0,
      breakdown.components[2]?.value ?? 0,
      input.notes ?? null,
      input.imageDataUrl ?? null,
      input.imageAlt ?? null,
      input.reporterName ?? null,
    ],
  );

  // A new report can extend the dataset's date range, which moves the recency
  // window, so the stored bounds are refreshed.
  await refreshDatasetBounds();

  const created = await findSightingById(id);
  if (!created) throw AppError.internal(new Error('Report saved but could not be read back.'));
  return created;
}

export async function deleteSighting(id: string): Promise<boolean> {
  // Scoped to user reports: upstream records are owned by the ingest pipeline
  // and deleting one would simply be re-created on the next run.
  const result = await query(`DELETE FROM sightings WHERE id = $1 AND source = 'user'`, [id]);
  const deleted = (result.rowCount ?? 0) > 0;

  // Refresh the stored date bounds, exactly as createSighting does.
  //
  // Without this, deleting the newest sighting leaves `latest_observed`
  // pointing at a row that no longer exists — and because the recency window
  // is measured back from that value, the whole "most recent 90 days" filter
  // silently shifts to a period containing nothing. The symptom is subtle:
  // the UI reports a date range the data does not actually cover.
  if (deleted) await refreshDatasetBounds();

  return deleted;
}

/** Recomputes the dataset's observed-date bounds from the rows themselves. */
export async function refreshDatasetBounds(): Promise<void> {
  await query(
    `UPDATE dataset_meta
        SET earliest_observed = (SELECT min(observed_at) FROM sightings),
            latest_observed   = (SELECT max(observed_at) FROM sightings),
            updated_at        = now()
      WHERE id = 1`,
  );
}

export async function getLastIngestRun() {
  const { rows } = await query<{
    started_at: Date;
    finished_at: Date | null;
    status: string;
    fetched: number;
    inserted: number;
    updated: number;
    rejected: number;
  }>(
    `SELECT started_at, finished_at, status, fetched, inserted, updated, rejected
       FROM ingest_runs ORDER BY started_at DESC LIMIT 1`,
  );

  const row = rows[0];
  if (!row) return null;
  return {
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
    status: row.status,
    fetched: row.fetched,
    inserted: row.inserted,
    updated: row.updated,
    rejected: row.rejected,
  };
}
