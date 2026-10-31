# The database, explained

A walkthrough of what is in the PostgreSQL database behind TickTrack UK, why
each piece exists, and how to check any of it yourself.

**Live instance:** Supabase project `eenidrepzktuspsmvbqd` (Elanco Project),
PostgreSQL **17.11**, region `eu-west-3`.

Run `cd server && npm run db:status` at any time for a live report.

---

## 1. First: those other schemas are not ours

Looking at the database you will see eight schemas. Only one is this
application's:

| Schema | Tables | Whose? |
|---|---:|---|
| `public` | **6** | **Ours.** Everything this app created. |
| `auth` | 27 | Supabase — user accounts, sessions, JWT handling |
| `storage` | 8 | Supabase — file storage metadata |
| `realtime` | 2 | Supabase — websocket subscriptions |
| `vault` | 1 | Supabase — encrypted secrets |
| `graphql`, `graphql_public`, `extensions` | 0 | Supabase — auto-generated GraphQL, installed extensions |

Those seven are created by Supabase when the project is provisioned, on every
project, whether you use them or not. They were there before this app and are
untouched by it. **We did not add them and we must not delete them** — removing
`auth` or `storage` would break the project permanently.

This is why `npm run db:reset` drops our six tables **by name** and never runs
`DROP SCHEMA public CASCADE`.

---

## 2. Our six tables

```
                 ┌──────────────┐
                 │   cities     │  14 rows — reference
                 │  name (PK)   │
                 └──────┬───────┘
                        │ FK: sightings.location → cities.name
                        │
┌──────────────┐  ┌─────▼─────────┐  ┌───────────────┐
│   species    │  │  sightings    │  │ dataset_meta  │
│  5 rows      │  │  1000 rows    │  │  1 row        │
│  reference   │  │  THE DATA     │  │  derived      │
└──────────────┘  └───────────────┘  └───────────────┘

┌──────────────────┐  ┌────────────────────┐
│   ingest_runs    │  │ schema_migrations  │
│   audit log      │  │  migration history │
└──────────────────┘  └────────────────────┘
```

### `sightings` — 1,000 rows, 21 columns

The fact table. Both the Elanco dataset and user-submitted reports live here,
separated by `source`, so every query, chart and map marker treats them
identically — no `UNION` anywhere.

| Column | Type | What it is |
|---|---|---|
| `id` | `text` PK | Upstream Elanco id, or `user-<uuid>` for a report |
| `source` | `text` | `'elanco'` or `'user'` |
| `observed_at` | `timestamp` | When the tick was seen |
| `location` | `text` FK | City name → `cities.name` |
| `species`, `latin_name` | `text` | e.g. `Marsh tick` / `Ixodes apronophorus` |
| `lat`, `lng` | `float8` | **Display** position (see §3) |
| `city_lat`, `city_lng` | `float8` | **True** city centre — used for directions |
| `severity_score` | `smallint` | 0–100, **derived** (see §4) |
| `severity_level` | `text` | `low` / `moderate` / `high` / `severe` |
| `density_component`<br>`species_component`<br>`season_component` | `real` | The three inputs to the score, stored so a rating can be *explained* rather than just asserted |
| `notes`, `image_data`, `image_alt`, `reporter_name` | `text` | User reports only; `NULL` for Elanco rows |
| `created_at`, `updated_at` | `timestamptz` | Row bookkeeping |

**Why only 5 of those 21 columns came from Elanco.** The upstream API returns
exactly `id`, `date`, `location`, `species`, `latinName`. Everything else —
coordinates, severity, the components — is computed by our server during
ingest. That is the central point of this project.

### `cities` — 14 rows

`name` (PK), `lat`, `lng`, `region`.

Elanco sends `"Manchester"` and no coordinates. This table is how a city name
becomes a point on a map. It also lets us `GROUP BY region` in SQL for the
regional insights, instead of pulling every row into Node to group it there.

### `species` — 5 rows

`name` (PK), `latin_name`, `genus`, `vector_weight`, `color_slot`.

`vector_weight` (0–1) feeds the severity model — higher for *Ixodes*, the genus
that transmits Lyme disease in the UK, than for *Dermacentor*. `color_slot`
pins each species to a fixed chart colour so it never changes between views.

### `dataset_meta` — exactly 1 row

```
breakpoint_moderate = 53
breakpoint_high     = 60
breakpoint_severe   = 67
max_window_count    = 32
earliest_observed   = 2012-01-03
latest_observed     = 2024-12-30
```

The severity boundaries, recalculated after every ingest. `CHECK (id = 1)`
enforces the single row — cheaper and clearer than a trigger.

### `ingest_runs` — the audit log

This is how we answer *"how did you handle duplicates and incomplete data?"*
with evidence rather than a claim:

```sql
SELECT id, status, fetched, inserted, updated, rejected, rejection_reasons
FROM ingest_runs ORDER BY started_at DESC;
```

```
 id | status  | fetched | inserted | updated | rejected
----+---------+---------+----------+---------+----------
  1 | success |    1000 |     1000 |       0 |        0
```

`rejection_reasons` is `jsonb` — if a row were dropped it would say *why*, e.g.
`{"missing or empty id": 3, "unknown location: Dublin": 1}`.

### `schema_migrations` — 2 rows

`001_init.sql` and `002_rls.sql`, with a checksum of each. The checksum catches
someone editing a migration after it has run, which is the usual way two
databases silently drift apart.

---

## 3. Why marker positions are offset

Elanco gives a city name only. Putting all 72 Manchester records on the exact
same pixel would draw **one** marker and hide that there are 72.

So each sighting is nudged away from its city centre by an amount derived from
a hash of its own id. Two properties matter:

- **Deterministic** — the same sighting lands on the same spot on every load,
  in every browser. `Math.random()` would make markers jump around and break
  shared links.
- **Bounded to ~6 km** — the size of the city itself, so it never pretends to
  be a street address.

Both positions are kept: `lat`/`lng` for drawing, `city_lat`/`city_lng` for the
truth. **"Get directions" uses the city centre**, because routing someone to a
hash-derived point would send them nowhere meaningful.

---

## 4. How severity is calculated

The Elanco API has no severity field. The brief needs one. So it is computed —
and the method is visible rather than hidden.

**Score (0–100) = three weighted parts:**

| Part | Weight | Meaning |
|---|---:|---|
| Local activity density | 50% | How many other sightings in that city at that point in the year (±45 days, all years) |
| Species vector weight | 30% | *Ixodes* ranks above *Dermacentor* |
| Seasonal pressure | 20% | Where the date sits on the UK tick-activity curve |

**Level = which percentile that score falls in**, not a fixed cut-off:

```sql
SELECT severity_level, count(*),
       round(100.0*count(*)/sum(count(*)) OVER (),1) AS pct
FROM sightings GROUP BY severity_level ORDER BY min(severity_score);
```

```
 severity_level | count |  pct
----------------+-------+-------
 low            |   279 | 27.9
 moderate       |   279 | 27.9
 high           |   271 | 27.1
 severe         |   171 | 17.1
```

**Why percentiles?** Fixed thresholds were tried first and measured: they put
0.6% of sightings in "low" and 4.4% in "severe", which makes three of the four
filter buttons useless. Percentiles — computed by Postgres with
`percentile_cont` — keep every level populated and make the rating's meaning
honest: *where this sighting stands relative to the rest of the data*.

This is the one thing to be careful about when explaining it: **the ratings are
modelled by this application, not supplied by Elanco.** The app says so
wherever a rating appears.

---

## 5. Why "LAST MIGRATION: No migrations" in the dashboard

This is **expected, not a problem.**

The dashboard panel reads `supabase_migrations.schema_migrations` — the table
the *Supabase CLI* writes when you run `supabase db push`. We do not use the
Supabase CLI, so that table does not exist:

```sql
SELECT to_regclass('supabase_migrations.schema_migrations');  -- NULL
```

Our migrations are tracked in our own `public.schema_migrations`, applied by
`server/src/db/migrate.ts`:

```sql
SELECT name, applied_at FROM public.schema_migrations ORDER BY name;
```

```
 001_init.sql   2026-10-31 21:09:12
 002_rls.sql    2026-10-31 21:09:12
```

The schema is fully migrated. The dashboard just reads a different bookkeeping
table than the one we use. (Same story for "No backups" — that is the free tier,
and "No repository connected" — that is Supabase's GitHub integration, which is
separate from pushing this repo to GitHub.)

---

## 6. Security: why every table has RLS on

Supabase runs **PostgREST over the `public` schema** and publishes it at the
project URL. Any table there **without** Row Level Security is readable by
anyone holding the project's `anon` key — and that key is public by design; it
ships inside browser JavaScript.

Creating these tables and walking away would have published all 1,000 sightings,
and any user reports, to the open internet.

`002_rls.sql` enables RLS on all six tables and revokes the `anon` /
`authenticated` grants. With **no policies defined, every row is denied** to
those roles.

Proof — querying as the roles PostgREST actually uses:

```
anon           -> BLOCKED (42501: permission denied for table sightings)
authenticated  -> BLOCKED (42501: permission denied for table sightings)
postgres       -> 1000 rows        <-- our API, works fine
```

**Why the API still works:** it connects as the database owner over a direct
Postgres connection, and a table's owner is not subject to its own RLS.

The order matters: deny everything by default, then add a policy deliberately if
a reason appears. The reverse — open it and remember to lock it later — is how
datasets end up indexed by search engines.

---

## 7. Checking any of this yourself

```bash
cd server
npm run db:status      # tables, row counts, RLS, migrations, ingest history, verdict
npm run ingest         # re-run the pipeline (safe: idempotent)
npm run db:reset       # dry run — prints what it WOULD drop, changes nothing
```

Or in the Supabase **SQL Editor**:

```sql
-- what is in the public schema
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- is RLS on everywhere?
SELECT relname, relrowsecurity FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY relname;

-- sightings per region
SELECT c.region, count(*) FROM sightings s
JOIN cities c ON c.name = s.location
GROUP BY c.region ORDER BY count(*) DESC;

-- the data actually matches the source
SELECT count(*) FROM sightings WHERE source = 'elanco';   -- 1000
```

---

## 8. Is it idempotent?

Yes, and this is worth demonstrating. Run the ingest twice:

```
run 1: fetched 1000, inserted 1000, updated    0, rejected 0
run 2: fetched 1000, inserted    0, updated 1000, rejected 0
```

The upstream id is the primary key and inserts use
`ON CONFLICT (id) DO UPDATE`, so re-running never duplicates — it refreshes.
`RETURNING (xmax = 0)` is the Postgres trick that tells an insert from an
update, so the run can be reported honestly instead of guessed at.

---

## Current state

```
Target   : Supabase eenidrepzktuspsmvbqd @ aws-1-eu-west-3, PostgreSQL 17.11

cities                14 rows   RLS on
dataset_meta           1 rows   RLS on
ingest_runs            1 rows   RLS on
schema_migrations      2 rows   RLS on
sightings           1000 rows   RLS on
species                5 rows   RLS on

Indexes on sightings : pkey, observed_at, location, species,
                       severity_level, source, (location, observed_at)
Constraints          : PK id, FK location→cities, CHECKs on source,
                       severity_level, severity_score 0–100

Verdict : Clean. Schema matches this application and nothing else is present.
```
