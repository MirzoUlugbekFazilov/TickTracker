/**
 * The ingest pipeline: fetch -> validate -> enrich -> upsert -> derive levels.
 *
 * This is where the backend brief's "consume and process data" lives, and it
 * is built around four concerns the brief calls out explicitly.
 *
 * LARGE DATASETS
 * Rows are inserted in batches via a single multi-row INSERT per chunk rather
 * than one statement per record. 1,000 individual round trips to Postgres
 * costs seconds; four batched statements costs milliseconds. The whole ingest
 * runs in one transaction, so a failure half way through leaves the previous
 * dataset intact rather than a half-replaced one.
 *
 * DUPLICATES
 * The upstream id is the primary key, and inserts are `ON CONFLICT (id) DO
 * UPDATE`. Ingest is therefore idempotent: running it twice produces the same
 * database, and a re-run picks up upstream corrections instead of duplicating
 * rows. The RETURNING clause distinguishes inserts from updates so the run can
 * be reported honestly.
 *
 * INCOMPLETE DATA
 * Records are validated structurally before they reach SQL. A row missing an
 * id, a parseable date, a location or a species is rejected rather than
 * coerced, and the reason is tallied into `ingest_runs.rejection_reasons`. An
 * unknown city is also a rejection, because a sighting we cannot place is not
 * something a map can honestly show. Silent dropping is the thing this is
 * designed to avoid: every rejected row is countable afterwards.
 *
 * SEVERITY
 * Scores are computed here (absolute, 0-100) and levels are assigned
 * afterwards from percentiles of the dataset's own distribution, computed by
 * Postgres with `percentile_cont`. Doing the quantiles in SQL rather than in
 * application memory means the levels stay correct as the table grows, and it
 * is the database doing what databases are good at.
 */

import type { PoolClient } from 'pg';
import { withTransaction, query } from '../db/pool.js';
import { CITIES, findCity } from '../domain/cities.js';
import { SPECIES, findSpecies } from '../domain/species.js';
import { resolvePosition } from '../domain/geo.js';
import { createSeverityScorer } from '../domain/severity.js';
import { fetchAllSightings, fetchStats, validateRawSighting } from './elancoClient.js';
import { AppError } from '../lib/errors.js';
import type { RawSighting } from '../types.js';

/** Rows per INSERT. Postgres caps bound parameters at 65535; 15 cols x 500 = 7500. */
const BATCH_SIZE = 500;

export interface IngestResult {
  runId: number;
  status: 'success' | 'partial' | 'failed';
  fetched: number;
  inserted: number;
  updated: number;
  rejected: number;
  rejectionReasons: Record<string, number>;
  breakpoints: { moderate: number; high: number; severe: number };
  durationMs: number;
}

/* ------------------------------------------------------------- reference */

/**
 * Seeds the reference tables from the code-level domain data.
 *
 * Reference data lives in TypeScript (it is versioned, reviewable and used by
 * the scorer) but is mirrored into Postgres so that aggregate queries can join
 * and group by region without pulling every row into Node.
 */
export async function seedReferenceData(client: PoolClient): Promise<void> {
  for (const city of CITIES) {
    await client.query(
      `INSERT INTO cities (name, lat, lng, region)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE
         SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, region = EXCLUDED.region`,
      [city.name, city.lat, city.lng, city.region],
    );
  }

  for (const species of SPECIES) {
    await client.query(
      `INSERT INTO species (name, latin_name, genus, vector_weight, color_slot)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO UPDATE
         SET latin_name    = EXCLUDED.latin_name,
             genus         = EXCLUDED.genus,
             vector_weight = EXCLUDED.vector_weight,
             color_slot    = EXCLUDED.color_slot`,
      [
        species.name,
        species.latinName,
        species.genus,
        species.vectorWeight,
        species.colorSlot,
      ],
    );
  }
}

/* ---------------------------------------------------------------- ingest */

export async function runIngest(): Promise<IngestResult> {
  const startedAt = Date.now();

  // The audit row is opened BEFORE any work, so a crash mid-ingest still
  // leaves evidence that a run was attempted rather than a silent gap.
  const { rows: runRows } = await query<{ id: number }>(
    `INSERT INTO ingest_runs (status) VALUES ('running') RETURNING id`,
  );
  const runId = runRows[0]?.id;
  if (runId === undefined) {
    throw AppError.internal(new Error('Could not open an ingest run record.'));
  }

  const rejectionReasons: Record<string, number> = {};
  const reject = (reason: string) => {
    rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;
  };

  try {
    /* ---------------------------------------------------------- fetch */
    const payload = await fetchAllSightings();
    const fetched = payload.length;

    /* ------------------------------------------------------- validate */
    const valid: RawSighting[] = [];
    for (const row of payload) {
      const result = validateRawSighting(row);
      if (!result.ok) {
        reject(result.reason);
        continue;
      }
      // A sighting we cannot place is not something the map can honestly
      // show, so an unmapped city is a rejection with its own reason rather
      // than a row quietly dropped at the centre of the country.
      if (!findCity(result.value.location)) {
        reject(`unknown location: ${result.value.location}`);
        continue;
      }
      valid.push(result.value);
    }

    if (valid.length === 0 && fetched > 0) {
      throw AppError.upstreamMalformed(
        'The Elanco service returned records, but none of them were usable.',
      );
    }

    /* ---------------------------------------------------------- score */
    // User-submitted reports are included in the scorer's density index so
    // that upstream and user records are measured on exactly the same scale.
    const { rows: userRows } = await query<{
      id: string;
      date: string;
      location: string;
      species: string;
    }>(
      `SELECT id, to_char(observed_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS date,
              location, species
         FROM sightings
        WHERE source = 'user'`,
    );

    const scorer = createSeverityScorer([
      ...valid,
      ...userRows.map((row) => ({ ...row, latinName: '' })),
    ]);

    /* --------------------------------------------------------- upsert */
    const result = await withTransaction(async (client) => {
      await seedReferenceData(client);

      let inserted = 0;
      let updated = 0;

      for (let start = 0; start < valid.length; start += BATCH_SIZE) {
        const batch = valid.slice(start, start + BATCH_SIZE);
        const values: unknown[] = [];
        const tuples: string[] = [];

        batch.forEach((sighting, index) => {
          const position = resolvePosition(sighting.location, sighting.id);
          const breakdown = scorer.score(sighting);
          const reference = findSpecies(sighting.species);

          const base = index * 15;
          tuples.push(
            `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},` +
              `$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},` +
              `$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15})`,
          );

          values.push(
            sighting.id,
            'elanco',
            sighting.date.replace('T', ' '),
            sighting.location,
            sighting.species,
            sighting.latinName || reference?.latinName || '',
            position.lat,
            position.lng,
            position.cityLat,
            position.cityLng,
            breakdown.score,
            breakdown.level,
            breakdown.components[0]?.value ?? 0,
            breakdown.components[1]?.value ?? 0,
            breakdown.components[2]?.value ?? 0,
          );
        });

        // `xmax = 0` is the standard way to tell an INSERT from an UPDATE in a
        // RETURNING clause: on a freshly inserted row the system column xmax
        // is zero, on an updated one it holds the updating transaction id.
        const { rows } = await client.query<{ was_insert: boolean }>(
          `INSERT INTO sightings (
             id, source, observed_at, location, species, latin_name,
             lat, lng, city_lat, city_lng,
             severity_score, severity_level,
             density_component, species_component, season_component
           )
           VALUES ${tuples.join(',')}
           ON CONFLICT (id) DO UPDATE SET
             observed_at       = EXCLUDED.observed_at,
             location          = EXCLUDED.location,
             species           = EXCLUDED.species,
             latin_name        = EXCLUDED.latin_name,
             lat               = EXCLUDED.lat,
             lng               = EXCLUDED.lng,
             city_lat          = EXCLUDED.city_lat,
             city_lng          = EXCLUDED.city_lng,
             severity_score    = EXCLUDED.severity_score,
             severity_level    = EXCLUDED.severity_level,
             density_component = EXCLUDED.density_component,
             species_component = EXCLUDED.species_component,
             season_component  = EXCLUDED.season_component,
             updated_at        = now()
           RETURNING (xmax = 0) AS was_insert`,
          values,
        );

        for (const row of rows) {
          if (row.was_insert) inserted += 1;
          else updated += 1;
        }
      }

      /* ------------------------------------------------- severity levels */
      const breakpoints = await deriveSeverityLevels(client);

      // Rescore user reports against the refreshed density index so their
      // ratings remain comparable with the records around them.
      for (const row of userRows) {
        const breakdown = scorer.score({
          date: row.date,
          location: row.location,
          species: row.species,
        });
        await client.query(
          `UPDATE sightings
              SET severity_score    = $2,
                  density_component = $3,
                  species_component = $4,
                  season_component  = $5,
                  severity_level    = CASE
                    WHEN $2 >= $6 THEN 'severe'
                    WHEN $2 >= $7 THEN 'high'
                    WHEN $2 >= $8 THEN 'moderate'
                    ELSE 'low' END,
                  updated_at        = now()
            WHERE id = $1`,
          [
            row.id,
            breakdown.score,
            breakdown.components[0]?.value ?? 0,
            breakdown.components[1]?.value ?? 0,
            breakdown.components[2]?.value ?? 0,
            breakpoints.severe,
            breakpoints.high,
            breakpoints.moderate,
          ],
        );
      }

      await client.query(
        `UPDATE dataset_meta
            SET max_window_count  = $1,
                earliest_observed = (SELECT min(observed_at) FROM sightings),
                latest_observed   = (SELECT max(observed_at) FROM sightings),
                updated_at        = now()
          WHERE id = 1`,
        [scorer.maxWindowCount],
      );

      return { inserted, updated, breakpoints };
    });

    const rejected = Object.values(rejectionReasons).reduce((sum, n) => sum + n, 0);
    const status: IngestResult['status'] = rejected > 0 ? 'partial' : 'success';

    await query(
      `UPDATE ingest_runs
          SET finished_at = now(), status = $2, fetched = $3,
              inserted = $4, updated = $5, rejected = $6, rejection_reasons = $7
        WHERE id = $1`,
      [
        runId,
        status,
        fetched,
        result.inserted,
        result.updated,
        rejected,
        JSON.stringify(rejectionReasons),
      ],
    );

    // Reconciliation against the upstream count, logged rather than thrown:
    // a mismatch is worth knowing about but is not a reason to discard a
    // successful ingest.
    const stats = await fetchStats();
    if (stats && stats.total_sightings !== fetched) {
      console.warn(
        `[ingest] upstream reports ${stats.total_sightings} sightings but ${fetched} were returned`,
      );
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `[ingest] ${status} in ${durationMs}ms — fetched ${fetched}, ` +
        `inserted ${result.inserted}, updated ${result.updated}, rejected ${rejected}`,
    );

    return {
      runId,
      status,
      fetched,
      inserted: result.inserted,
      updated: result.updated,
      rejected,
      rejectionReasons,
      breakpoints: result.breakpoints,
      durationMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await query(
      `UPDATE ingest_runs
          SET finished_at = now(), status = 'failed', error = $2,
              rejection_reasons = $3
        WHERE id = $1`,
      [runId, message, JSON.stringify(rejectionReasons)],
    ).catch(() => undefined);

    console.error(`[ingest] failed: ${message}`);
    throw error;
  }
}

/* ------------------------------------------------------ severity levels */

/**
 * Assigns severity levels from percentiles of the current score distribution.
 *
 * Fixed cut-offs were tried first and measured: on the real 1,000 records they
 * placed 0.6% of sightings in "low" and 4.4% in "severe", which makes three of
 * the four filter options almost useless. Percentiles keep every level
 * populated, self-adjust as the data changes, and make the rating's meaning
 * explicit — a sighting's standing relative to the rest of the dataset.
 *
 * `percentile_cont` is doing the work in Postgres rather than sorting a
 * thousand numbers in Node, which keeps this correct as the table grows.
 */
async function deriveSeverityLevels(
  client: PoolClient,
): Promise<{ moderate: number; high: number; severe: number }> {
  const { rows } = await client.query<{
    moderate: string | null;
    high: string | null;
    severe: string | null;
  }>(
    `SELECT percentile_cont(0.30) WITHIN GROUP (ORDER BY severity_score) AS moderate,
            percentile_cont(0.60) WITHIN GROUP (ORDER BY severity_score) AS high,
            percentile_cont(0.85) WITHIN GROUP (ORDER BY severity_score) AS severe
       FROM sightings`,
  );

  const row = rows[0];
  const breakpoints = {
    moderate: Math.round(Number(row?.moderate ?? 0)),
    high: Math.round(Number(row?.high ?? 0)),
    severe: Math.round(Number(row?.severe ?? 0)),
  };

  await client.query(
    `UPDATE sightings
        SET severity_level = CASE
              WHEN severity_score >= $3 THEN 'severe'
              WHEN severity_score >= $2 THEN 'high'
              WHEN severity_score >= $1 THEN 'moderate'
              ELSE 'low' END`,
    [breakpoints.moderate, breakpoints.high, breakpoints.severe],
  );

  await client.query(
    `UPDATE dataset_meta
        SET breakpoint_moderate = $1,
            breakpoint_high     = $2,
            breakpoint_severe   = $3,
            updated_at          = now()
      WHERE id = 1`,
    [breakpoints.moderate, breakpoints.high, breakpoints.severe],
  );

  return breakpoints;
}

/** True when the sightings table has no rows — drives ingest-on-boot. */
export async function isDatasetEmpty(): Promise<boolean> {
  const { rows } = await query<{ count: string }>(
    'SELECT count(*)::text AS count FROM sightings',
  );
  return (rows[0]?.count ?? '0') === '0';
}
