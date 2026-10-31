# TickTrack UK

**Elanco Placement Programme — Technical Task (Full Stack)**
**Mirzo-Ulugbek Fazilov**

A full-stack tick sighting tracker for the UK. A Node/TypeScript API ingests the
Elanco dataset into PostgreSQL, enriches it with coordinates and a derived risk
rating, and serves filtered searches and aggregate insights. A React/Vite
frontend maps it, explains it, and lets people contribute sightings of their own.

```
┌──────────────────┐   fetch + validate    ┌──────────────────┐   SQL    ┌──────────────┐
│  Elanco API      │ ────────────────────► │  TickTrack API   │ ───────► │  PostgreSQL  │
│  (read-only)     │   dedupe + enrich     │  Node + Express  │ ◄─────── │              │
└──────────────────┘                       └──────────────────┘          └──────────────┘
                                                    ▲
                                                    │  REST (filters, facets, aggregates)
                                                    ▼
                                           ┌──────────────────┐
                                           │  React + Vite    │
                                           │  Leaflet map     │
                                           └──────────────────┘
```

| | |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Leaflet, Recharts |
| **Backend** | Node 22, TypeScript, Express 5, `pg`, Zod |
| **Database** | PostgreSQL 16 (local or Supabase) |

---

## Quick start

Requires **Node 20.19+** and a **PostgreSQL 14+** database.

```bash
# 1. Database — either a local cluster…
brew install postgresql@16 && brew services start postgresql@16 && createdb ticktrack
#    …or a hosted one (Supabase). Either way you need a connection string.

# 2. API
cd server
cp .env.example .env          # then set DATABASE_URL (see below)
npm install
npm run dev                   # migrates, ingests on first run, listens on :4000

# 3. Frontend, in a second terminal
cd web
npm install
npm run dev                   # http://localhost:5173
```

On first boot the API creates its schema, fetches all 1,000 upstream records,
enriches them and writes them to Postgres. That takes about a second; the log
reports what happened:

```
[migrate] applied 001_init.sql
[boot] API listening on http://localhost:4000
[ingest] success in 663ms — fetched 1000, inserted 1000, updated 0, rejected 0
[ingest] severity breakpoints: { moderate: 53, high: 60, severe: 67 }
```

### Setting `DATABASE_URL`

**Supabase** — Dashboard → **Connect** → *Connection string* → **URI**. Use the
**session pooler** (port 5432) or transaction pooler (6543); the direct
`db.<ref>.supabase.co` host is IPv6-only on the free tier and will not resolve
on most networks. Replace `[YOUR-PASSWORD]` with your database password:

```
DATABASE_URL=postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
```

**Local**:

```
DATABASE_URL=postgresql://localhost:5432/ticktrack
```

TLS is auto-detected from the host — off for `localhost`, on for anything else —
so the same codebase runs against both with only this variable changing.
`.env` is gitignored; `.env.example` documents every variable.

Then point the app at it and check what landed:

```bash
cd server
npm run migrate      # create the schema
npm run ingest       # populate it
npm run db:status    # report exactly what is in there
```

### Row Level Security on Supabase

Supabase runs **PostgREST over the `public` schema** and publishes it on the
project's public URL. Any table created there without RLS enabled is readable
with the project's anon key — which is a public value, shipped in browser
bundles. Creating these tables and walking away would publish the whole dataset.

So `002_rls.sql` enables RLS on every table and revokes the `anon` /
`authenticated` grants. With **no policies defined, every row is denied** to
those roles. The API is unaffected: it connects as the database owner over a
direct Postgres connection, and a table's owner is not subject to RLS.

Deny by default, add policies deliberately if a use case appears. On a local
cluster the migration is a harmless no-op.

`npm run db:status` reports RLS state per table and flags anything unprotected
when the target is Supabase.

See **[DATABASE.md](DATABASE.md)** for a full walkthrough of the schema, how
severity is calculated, why marker positions are offset, and why the Supabase
dashboard shows "No migrations" (it reads the Supabase CLI's bookkeeping table,
not ours).

### Resetting

```bash
npm run db:status          # what is in there now
npm run db:reset           # dry run — prints what it would drop, changes nothing
npm run db:reset -- --yes  # actually drop this app's tables and re-migrate
```

`db:reset` drops only the six tables this application creates, **by name**. It
never issues `DROP SCHEMA public CASCADE` — on Supabase that would destroy
auth, storage and realtime along with it.

### Scripts

| Location | Command | Does |
|---|---|---|
| `server/` | `npm run dev` | API with hot reload |
| | `npm run migrate` | Apply migrations only |
| | `npm run ingest` | Migrate, then run the pipeline once |
| | `npm run db:status` | Report tables, row counts, RLS, migration and ingest history |
| | `npm run db:reset` | Dry run; `-- --yes` to drop this app's tables and re-migrate |
| | `npm run build` / `start` | Compile to `dist/`, run compiled |
| | `npm run typecheck` | `tsc --noEmit` |
| `web/` | `npm run dev` | Vite dev server, proxies `/api` → `:4000` |
| | `npm run build` | Type-check then production bundle |
| | `npm run lint` | oxlint, including React compiler rules |

---

## The finding that shaped the architecture

Before writing code I checked what the upstream API actually returns. It is five
fields:

```json
{
  "id": "02WNholuSg6ndCk4c1dA",
  "date": "2022-08-01T06:40:31",
  "location": "Manchester",
  "species": "Marsh tick",
  "latinName": "Ixodes apronophorus"
}
```

The brief asks for markers indicating **severity**, **recent activity** and
**species**, a **severity filter**, and **aggregates per region**. Only species
is in the payload. There are **no coordinates at all**, no severity field, and
nothing that makes "recent" meaningful.

So three things are derived — and because this is a full-stack build, they are
derived **once at ingest time on the server**, not repeatedly in every browser.
That is the single most important architectural decision here, and the reason
the frontend is now purely presentational.

### 1. Coordinates — `server/src/domain/geo.ts`

City names resolve against a table of 14 UK centroids. Plotting all 72
Manchester records on one pixel would collapse them into a single marker, so
each sighting is offset from its centroid by an amount derived from an FNV-1a
hash of its own id. Two properties matter: it is **deterministic**, so a
sighting lands on the same spot on every load and deep links stay valid
(`Math.random()` would make markers jump between renders); and it is **bounded
to ~6 km**, the footprint of the city, so it never implies precision the data
does not have.

Consequently **"Get directions" routes to the city centre, not the marker** —
navigating someone to a hash-derived point would send them somewhere with no
relationship to the sighting.

### 2. Severity — `server/src/domain/severity.ts`

A 0–100 score from three weighted components, each from a real field:

| Component | Weight | What it measures |
|---|---:|---|
| Local activity density | 50% | Sightings in the same city within ±45 days of the same point in the year, across all years |
| Species vector weight | 30% | Higher for *Ixodes* (the UK's Lyme borreliosis genus) than *Dermacentor* |
| Seasonal questing pressure | 20% | Position on the bimodal UK activity curve |

**The four levels are percentiles, not fixed cut-offs** — and that was a
measured decision, not a preference. Fixed thresholds were tried first and put
0.6% of sightings in "low" and 4.4% in "severe", which makes three of the four
filter options nearly useless. Percentile breakpoints give a usable spread:

```
low 279 (27.9%) · moderate 279 (27.9%) · high 271 (27.1%) · severe 171 (17.1%)
```

They are computed **in SQL** with `percentile_cont` at the end of each ingest,
so they self-adjust as the data changes and stay correct as the table grows.
Every rating is explainable: the API returns the three components and their
reasoning with each sighting, and the detail panel shows the working.

### 3. Recency — `server/src/db/sightingsRepo.ts`

The dataset ends **30 December 2024**. Measuring recency against the wall clock
would mark every record stale and the indicator would convey nothing. The 90-day
window is measured back from the **newest record in the data**, and the UI says
exactly that wherever recency appears.

---

## Backend

### Data handling & processing — `server/src/ingest/`

The pipeline is `fetch → validate → enrich → upsert → derive levels`, built
around the four concerns the brief names.

**Large datasets.** Rows are written with a multi-row `INSERT` per 500-record
batch rather than one statement each — 1,000 round trips costs seconds, four
batched statements costs milliseconds. The whole ingest runs in one transaction,
so a failure half way through leaves the previous dataset intact.

**Duplicates.** The upstream id is the primary key and inserts are
`ON CONFLICT (id) DO UPDATE`. Ingest is therefore **idempotent** — verified:

```
run 1: fetched 1000, inserted 1000, updated    0, rejected 0
run 2: fetched 1000, inserted    0, updated 1000, rejected 0
```

`RETURNING (xmax = 0)` is what distinguishes an insert from an update, so the
run can be reported honestly rather than guessed at.

**Incomplete data.** Records are validated structurally before they reach SQL. A
row missing an id, a parseable date, a location or a species is **rejected, not
coerced**, and so is one naming a city we cannot place — a sighting we cannot
locate is not something a map can honestly show. Every rejection is tallied by
reason into `ingest_runs.rejection_reasons`, so nothing is silently dropped:

```sql
SELECT id, status, fetched, inserted, updated, rejected, rejection_reasons
FROM ingest_runs ORDER BY started_at DESC;
```

**Scheduling.** Ingest runs on boot only when the table is empty, and never
blocks the HTTP listener — a platform health check would otherwise time out and
restart the container mid-import, forever. In production this belongs in a cron
job; `npm run ingest` exists for exactly that.

### Schema — `server/src/db/migrations/001_init.sql`

| Table | Purpose |
|---|---|
| `sightings` | Fact table. Elanco records and user reports in one table, distinguished by `source`, so every query treats them identically without a `UNION`. |
| `cities`, `species` | Reference data, mirrored from code so aggregates can `GROUP BY` region in SQL. |
| `dataset_meta` | One row: severity breakpoints, density normaliser, date bounds. |
| `ingest_runs` | Audit row per run — the answer to "how did you handle duplicates and incomplete data". |

All six tables (including `schema_migrations`) have RLS enabled — see
[Row Level Security on Supabase](#row-level-security-on-supabase).

`observed_at` is `TIMESTAMP` (not `TIMESTAMPTZ`) on purpose: upstream sends no
timezone designator, and letting the driver reinterpret it would shift every
British-summer sighting by an hour and occasionally across a date boundary. The
`pg` type parser for OID 1114 is overridden for the same reason.

Indexed on `observed_at`, `location`, `species`, `severity_level`, `source`, plus
a composite `(location, observed_at DESC)` for the commonest query shape.

### Endpoints

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/health` | Database and upstream checked independently; only the database affects the status code |
| `GET` | `/api/meta` | Cities, species, severity breakpoints, date range, last ingest — so the frontend hard-codes nothing |
| `GET` | `/api/sightings` | Filter by `from`, `to`, `city`, `species`, `severity`, `source`, `recentOnly`; `limit`/`offset`. Returns data **+ facet counts** |
| `GET` | `/api/sightings/:id` | One record |
| `GET` | `/api/sightings/:id/image` | Photograph, served separately from the JSON |
| `POST` | `/api/sightings` | Create a report; 201 with the scored record |
| `DELETE` | `/api/sightings/:id` | User reports only — Elanco records are owned by the pipeline |
| `GET` | `/api/insights/regions` | Sightings per region, with mean severity |
| `GET` | `/api/insights/trends?interval=week\|month\|year` | Time series via `date_trunc` |
| `GET` | `/api/insights/species` | Breakdown by species |
| `GET` | `/api/insights/seasonal` | Twelve monthly counts, including empty months |
| `GET` | `/api/insights/summary` | Headline figures in one pass |
| `POST` | `/api/admin/ingest` | Manual re-ingest (see Limitations) |

Every insights endpoint accepts the same filters as `/api/sightings`, so a chart
can always be scoped to exactly what the map is showing.

**Facets are the detail worth noticing.** Each filter option shows how many
sightings it would yield. Each dimension is counted with **its own filter
excluded** — so ticking "Severe" still shows what Low, Moderate and High would
give you. Counting facets against the fully filtered set is the classic faceted
search bug: every unselected option reports 0 and looks unavailable when in fact
it would widen the result. (This was caught and fixed during testing.)

### Error handling — `server/src/lib/errors.ts`, `middleware/errorHandler.ts`

A typed error taxonomy mapped to status codes by one middleware, so handlers
throw and never think about HTTP.

- **Upstream failures.** Timeout on every request; exponential backoff with
  **jitter** (without it, every client that failed together retries together);
  `Retry-After` honoured on 429; 4xx other than 429 not retried, because a
  malformed request fails identically next time. A failed ingest never takes the
  process down — the API keeps serving what is already stored.
- **Database failures.** `pg` connection errors are recognised by code and
  become a 503, so a client can tell a transient outage from a bug.
- **Invalid submissions.** Zod validates every query and body; failures return
  400 with **per-field messages** that the report form surfaces inline.
- **Oversized bodies** become a 413 with an actionable message rather than an
  opaque 500.
- **Nothing internal leaks.** Stack traces, SQL and connection strings go to the
  log; the client gets a stable `code` and a sentence written for a human.

Verified:

```
404 NOT_FOUND          GET /api/nope
404 NOT_FOUND          unknown sighting id
400 VALIDATION_FAILED  from=2024-12-31&to=2020-01-01   (inverted range)
400 VALIDATION_FAILED  severity=catastrophic
400 VALIDATION_FAILED  future date → "A sighting has to have already happened."
400 VALIDATION_FAILED  bad city/species/time → three field-level messages
404 NOT_FOUND          DELETE on an Elanco record (refused by design)
```

---

## Frontend

All twelve of the brief's frontend requirements are implemented.

**1. Interactive map** — Leaflet + OpenStreetMap (no API key, so a reviewer can
clone and run). Markers encode severity as **both fill and diameter**, recency
as a pulsing ring, and provenance as shape. Zoom-aware clustering is
hand-rolled: `leaflet.markercluster` has no React 19 support, mutates the DOM
outside React, and builds icons from HTML strings that design tokens cannot
reach. Filters for date range, species, severity, city and recency, all
server-side with live facet counts.

**2. Sighting information** — Detail panel on marker click with the full record
and the severity derivation; a per-year activity timeline for the surrounding
25 km; quick actions for Report, Get Directions and Share (Web Share API →
clipboard → visible link fallback, producing a `?sighting=<id>` deep link).

**3. Education** — Species identification guide for the five species in the
dataset, with schematic illustrations drawn to show the actual distinguishing
characters; prevention and safe-removal guidance; the seasonal activity chart
with **city and year dropdowns**, plus species and yearly trend charts — all
reading from `/api/insights/*`.

**4. Report a sighting** — Form with date, time, location, species and notes;
validation with distinct **error, warning and success** states (errors block,
warnings do not — a 3am sighting is unusual, not invalid); image upload with
type/size checks, automatic downscaling and a prompt for alt text.

### Design

Plain CSS with a token system — no utility framework, no component library, no
motion library. Radii derive from one `--radius` base so nested corners stay
concentric; elevation is three-layer (contact + ambient + distant) tinted with
the brand hue; motion is hand-written CSS limited to `transform` and `opacity`
so it composites off the main thread.

**Colour is validated, not chosen by eye.** The severity ramp is single-hue and
ordered by lightness. The obvious green-to-red traffic light was measured and
**rejected**: red against green is **ΔE 4.1 under deuteranopia** — effectively
identical for a large share of male users — and amber against orange fails even
the normal-vision floor at 13.6. Lightness survives colour-vision deficiency, so
the ramp is ordered by it. The five species colours were separately validated
(worst adjacent pair ΔE 9.1 light / 8.4 dark against a ≥8 target).

### Accessibility

Targeting WCAG 2.2 AA. Skip link, landmark regions, one `h1` per page. Map
markers are focusable and respond to Enter *and* Space with accessible names
naming species, place, date and rating. Filter changes are announced through a
polite live region, since the map conveys nothing to a non-sighted user. Focus
moves to the detail panel when it opens and to the error summary when a submit
is rejected; Escape closes panels and restores focus. Route changes update the
title and move focus, which an SPA does not do on its own. Every chart has a
table alternative and states its finding in prose. Nothing depends on colour
alone. 44px targets, `:focus-visible` rings, `prefers-reduced-motion`,
`forced-colors`.

One contrast bug found during testing — a dark badge ink left on a dark tint,
measuring **1.14:1** — was fixed to 9.9:1.

### Wireframes

Desktop and mobile, on the **About** page, drawn as inline SVG so they live in
the repo as reviewable source and theme with the app.

---

## Technical choices

| Choice | Why, and what was rejected |
|---|---|
| **Express 5** | Native async error propagation, stable, minimal. Fastify is faster, but this workload is database-bound and the difference is noise. |
| **`pg` over an ORM** | The interesting work here is aggregate SQL — `percentile_cont`, `date_trunc`, `FILTER (WHERE …)`, faceted counts. An ORM would mean writing that as raw SQL anyway, through a layer. Prisma would earn its place the moment there were a dozen related tables. |
| **Plain-SQL migrations** | The whole schema is one file. A migration framework adds a CLI, a config and a DSL to run `psql -f`. The runner is ~70 lines and still gives ordering, idempotency, per-file transactions and a checksum that catches an applied migration being edited. |
| **Zod** | Validation is the one place where hand-rolling is a false economy — the types and the runtime checks must not drift, and Zod derives one from the other. |
| **Severity at ingest, not query time** | It is expensive (an O(n²)-ish density index) and dataset-relative. Computing it per request would make every query slow and the answers inconsistent between them. |
| **Server-side filtering** | The brief asks for it, and a client that downloads the whole table to narrow it stops working the moment the table exceeds a browser tab. Costs a round trip per change, paid for with a 220ms debounce and keep-previous-results. |
| **No data-fetching library** | A close call now there are several endpoints and a mutation. TanStack Query would fit. The ~50 lines it replaces are explicit about an out-of-order-response bug that is easy to get wrong, and are commented as such. **Trigger to revisit:** a third consumer of the same endpoint, or the first cache-invalidation requirement. |
| **Two type files, not a shared package** | The contract is mirrored in `server/src/types.ts` and `web/src/types/sighting.ts`. A workspace package buys compile-time coupling across one boundary at the cost of build ordering and a publish step. **Trigger to revisit:** a second API consumer. |
| **Leaflet + OSM** | No key, no billing account. Mapbox and Google Maps both gate behind one. |
| **Recharts** | Composable, accessible-by-default SVG. Code-split so it only loads on `/learn`. |

---

## Known limitations

Stated plainly, because a prototype that hides its edges is harder to review.

- **No automated test suite.** Effort went into the data layer being correct by
  construction — pure functions in `server/src/domain/` — and into manual
  end-to-end verification. The severity distribution, ingest idempotency, every
  endpoint and every error path were exercised and are quoted above. Those pure
  modules plus the route handlers (via supertest against a test database) are
  exactly what a Vitest suite should target first, and that is the honest next
  step rather than a claim of coverage.
- **`POST /api/admin/ingest` is unauthenticated.** It is there so a reviewer can
  re-run the pipeline. In production it needs auth, or better, deleting in
  favour of a scheduled job — a long-running import triggered by an open HTTP
  endpoint is an obvious way to overload both services.
- **Images are base64 in a `TEXT` column.** Fine for an MVP with downscaled
  ~100 KB photographs, and they are served from a dedicated endpoint so they
  never bloat the list payload. Production belongs in object storage with
  signed URLs; the row would hold a key instead.
- **No authentication.** Anyone can post or delete a report. Real crowdsourcing
  needs accounts, rate limiting and moderation.
- **TLS chain verification is disabled** for hosted Postgres
  (`rejectUnauthorized: false`). The connection is encrypted; the chain is not
  verified, because Supabase's CA is not in Node's trust store. The correct fix
  is to ship that CA certificate and pass it as `ca`.
- **Marker positions are approximate by construction** — see above.
- **The dataset's seasonality is flat.** Sightings are spread fairly evenly
  across the calendar, so the seasonal chart does not show the strong spring
  peak UK tick activity really has. That is a property of the supplied data.
- **Dark-mode map tiles are filtered, not designed.** OSM publishes only a light
  raster style; dark mode desaturates and inverts it rather than adding a second
  provider.

---

## Content notes

Species descriptions are written at the level the sources support — genus-level
ecology and morphology — rather than inventing species-level specifics. Where a
claim would need a clinical source I do not have, the entry says so. Worth
noting: *Ixodes ricinus*, the tick most often found on UK pets and people, does
not appear in this dataset at all.

Prevention content reflects standard published UK public-health and veterinary
guidance. It is general education, and the UI pairs it with a visible statement
that it is not veterinary or medical advice.

**Risk ratings are modelled by this application, not supplied by Elanco.**

---

## Repository layout

```
.
├── server/                  Node + TypeScript API
│   └── src/
│       ├── db/              Pool, migrations, repository (all SQL)
│       ├── domain/          Cities, species, geocoding, severity model
│       ├── ingest/          Upstream client + pipeline
│       ├── routes/          sightings, insights, meta/health/admin
│       ├── middleware/      Error handling
│       └── lib/             Error taxonomy
└── web/                     React + Vite frontend
    └── src/
        ├── components/      map/ filters/ detail/ charts/ form/ layout/ ui/
        ├── hooks/           Data provider, insights, theme
        ├── lib/             API client, display helpers, colours
        ├── pages/           Map, Learn, Report, About
        └── styles/          tokens, base, motion, components, leaflet
```

## Licence

MIT. Map data © OpenStreetMap contributors. Sighting data © Elanco.
