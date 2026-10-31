-- ============================================================================
-- 001_init — TickTrack UK schema
-- ============================================================================
--
-- Four tables, each with a distinct job:
--
--   cities, species  reference data. Small, slow-changing, and the thing the
--                    enrichment step joins against. Kept in the database
--                    rather than only in code so that aggregate queries can
--                    group by region in SQL instead of in application memory.
--
--   sightings        the fact table. Holds both upstream Elanco records and
--                    user-submitted reports, distinguished by `source`, so
--                    every query, aggregate and map marker treats them
--                    identically without a UNION.
--
--   dataset_meta     a single row holding the severity breakpoints derived
--                    from the current dataset. Written at the end of each
--                    ingest. See the note on severity below.
--
--   ingest_runs      an audit row per ingest. This is where "how did you
--                    handle duplicates and incomplete data" is actually
--                    answerable: every run records what it fetched, inserted,
--                    updated and rejected, and why.
-- ============================================================================

-- ---------------------------------------------------------------- reference

CREATE TABLE IF NOT EXISTS cities (
  name   TEXT PRIMARY KEY,
  lat    DOUBLE PRECISION NOT NULL,
  lng    DOUBLE PRECISION NOT NULL,
  region TEXT NOT NULL
);

COMMENT ON TABLE cities IS
  'City centroids for the locations the upstream API reports. The API sends a '
  'bare city name and no coordinates, so this table is how a sighting becomes '
  'mappable.';

CREATE TABLE IF NOT EXISTS species (
  name          TEXT PRIMARY KEY,
  latin_name    TEXT NOT NULL,
  genus         TEXT NOT NULL,
  -- 0..1 weighting used by the severity model. Documented in domain/species.ts.
  vector_weight REAL NOT NULL CHECK (vector_weight >= 0 AND vector_weight <= 1),
  -- Fixed categorical colour slot, so a species keeps its colour across every
  -- chart and the map regardless of sort order.
  color_slot    SMALLINT NOT NULL CHECK (color_slot BETWEEN 1 AND 8)
);

-- ------------------------------------------------------------------- facts

CREATE TABLE IF NOT EXISTS sightings (
  -- The upstream id for Elanco records, or a generated `user-<uuid>` for
  -- reports. Using the upstream id as the primary key is what makes ingest
  -- idempotent: a re-run upserts rather than duplicating.
  id                 TEXT PRIMARY KEY,
  source             TEXT NOT NULL CHECK (source IN ('elanco', 'user')),

  -- The upstream `date` carries no timezone designator, so it is stored as a
  -- naive local timestamp and interpreted consistently at both ends. Using
  -- TIMESTAMPTZ here would silently shift every British-summer sighting by an
  -- hour, and occasionally across a date boundary.
  observed_at        TIMESTAMP NOT NULL,

  location           TEXT NOT NULL REFERENCES cities(name),
  species            TEXT NOT NULL,
  latin_name         TEXT NOT NULL DEFAULT '',

  -- Display position: city centroid plus a deterministic offset so same-city
  -- sightings do not stack on one pixel. See domain/geo.ts.
  lat                DOUBLE PRECISION NOT NULL,
  lng                DOUBLE PRECISION NOT NULL,
  -- The honest, unjittered position. Used for distance queries and directions.
  city_lat           DOUBLE PRECISION NOT NULL,
  city_lng           DOUBLE PRECISION NOT NULL,

  -- Derived severity. Score is absolute (0-100); level is relative to the
  -- dataset's own distribution and is recomputed after every ingest.
  severity_score     SMALLINT NOT NULL CHECK (severity_score BETWEEN 0 AND 100),
  severity_level     TEXT NOT NULL
                       CHECK (severity_level IN ('low','moderate','high','severe')),
  -- The three normalised inputs, stored so the API can explain a rating
  -- instead of asking the user to trust a colour.
  density_component  REAL NOT NULL,
  species_component  REAL NOT NULL,
  season_component   REAL NOT NULL,

  -- User-submitted extras. Null for upstream records.
  notes              TEXT,
  image_data         TEXT,
  image_alt          TEXT,
  reporter_name      TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes chosen for the queries that actually run:
--   * the filter endpoint orders by observed_at and ranges over it
--   * location and species are the two equality filters
--   * severity_level drives the fourth filter
--   * the trends aggregate groups by a date_trunc over observed_at
CREATE INDEX IF NOT EXISTS sightings_observed_at_idx  ON sightings (observed_at DESC);
CREATE INDEX IF NOT EXISTS sightings_location_idx     ON sightings (location);
CREATE INDEX IF NOT EXISTS sightings_species_idx      ON sightings (species);
CREATE INDEX IF NOT EXISTS sightings_severity_idx     ON sightings (severity_level);
CREATE INDEX IF NOT EXISTS sightings_source_idx       ON sightings (source);
-- Composite for the commonest combination: a date range within one city.
CREATE INDEX IF NOT EXISTS sightings_location_date_idx
  ON sightings (location, observed_at DESC);

-- ---------------------------------------------------------------- metadata

CREATE TABLE IF NOT EXISTS dataset_meta (
  -- Enforces exactly one row. Cheaper and clearer than a trigger.
  id                  SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  breakpoint_moderate SMALLINT NOT NULL DEFAULT 0,
  breakpoint_high     SMALLINT NOT NULL DEFAULT 0,
  breakpoint_severe   SMALLINT NOT NULL DEFAULT 0,
  -- Busiest city-and-window count; the normaliser for the density component.
  max_window_count    INTEGER  NOT NULL DEFAULT 1,
  earliest_observed   TIMESTAMP,
  latest_observed     TIMESTAMP,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE dataset_meta IS
  'Severity level boundaries are percentiles of the dataset''s own score '
  'distribution rather than fixed constants, so they have to be stored and '
  'recomputed whenever the data changes.';

INSERT INTO dataset_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------ audit

CREATE TABLE IF NOT EXISTS ingest_runs (
  id                SERIAL PRIMARY KEY,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  status            TEXT NOT NULL CHECK (status IN ('running','success','partial','failed')),
  fetched           INTEGER NOT NULL DEFAULT 0,
  inserted          INTEGER NOT NULL DEFAULT 0,
  updated           INTEGER NOT NULL DEFAULT 0,
  rejected          INTEGER NOT NULL DEFAULT 0,
  -- { "missing id": 3, "unparseable date": 1, ... } — so a malformed upstream
  -- record is visible and countable rather than silently dropped.
  rejection_reasons JSONB NOT NULL DEFAULT '{}'::jsonb,
  error             TEXT
);

CREATE INDEX IF NOT EXISTS ingest_runs_started_idx ON ingest_runs (started_at DESC);
