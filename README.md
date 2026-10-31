# TickTrack UK

**Elanco Placement Programme — Technical Task (Frontend)**
**Mirzo-Ulugbek Fazilov**

An interactive map and reporting tool for tick sightings across the United
Kingdom, built on the Elanco Tick Sightings API. It plots 1,000 crowdsourced
sightings, lets people filter and explore them, explains how to identify the
species involved, and lets them report a sighting of their own.

---

## Quick start

```bash
# Requires Node 20.19+ or 22.12+ (Vite 8). Developed on Node 22.18.
npm install
npm run dev          # http://localhost:5173
```

| Script              | What it does                                      |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | Dev server with hot module replacement            |
| `npm run build`     | Type-check, then produce a production bundle      |
| `npm run preview`   | Serve the production build locally                |
| `npm run typecheck` | TypeScript only, no emit                          |
| `npm run lint`      | oxlint, including the React compiler rules        |

No environment variables, API keys or accounts are needed — clone, install, run.
`.env.example` documents the optional overrides (a different API base URL, a
different tile provider, a different upload size limit).

---

## The headline finding: three things the brief asks for are not in the data

Before any code, I checked what the API actually returns. This shaped the whole
build, so it goes first.

`GET https://dev-task.elancoapps.com/data/tick-sightings` returns 1,000 records
of exactly this shape:

```json
{
  "id": "02WNholuSg6ndCk4c1dA",
  "date": "2022-08-01T06:40:31",
  "location": "Manchester",
  "species": "Marsh tick",
  "latinName": "Ixodes apronophorus"
}
```

Five fields. The brief asks for markers indicating **severity**, **recent
activity** and **species**, plus a **severity filter**. Only species is in the
payload. There are **no coordinates at all**, no severity field, and nothing
that makes "recent" meaningful.

So three things had to be derived. The approach throughout was: derive something
defensible from the data that *is* present, show the user the working, and label
it as derived everywhere it appears — rather than inventing values and
presenting them as if they came from Elanco.

### 1. Coordinates — `src/data/cities.ts`, `src/lib/geo.ts`

The 14 city names are resolved against a table of city-centre coordinates. A live
geocoding service would have added an API key, a rate limit and a network
dependency to render the core view, for a set of place names that is fixed and
known in advance.

Plotting all 72 Manchester records on one pixel would collapse them into a single
marker, so each sighting is offset from its centroid by an amount derived from an
FNV-1a hash of its own id. Two properties matter:

- **Deterministic** — the same sighting lands on the same spot in every browser
  and on every load, so deep links stay valid. `Math.random()` would make markers
  jump between renders and look like a bug.
- **Bounded to ~6 km** — the footprint of the city itself, so it never implies
  street-level precision. The offset uses a square-root radius so points spread
  evenly over the disc rather than bunching at the centre.

This is why **"Get directions" routes to the city centre, not the marker**.
Navigating someone to a hash-derived point would send them somewhere with no
relationship to the sighting.

### 2. Severity — `src/lib/severity.ts`

A 0–100 score from three weighted components, each from a real field:

| Component                  | Weight | What it measures                                                                                     |
| -------------------------- | -----: | ---------------------------------------------------------------------------------------------------- |
| Local activity density     |    50% | Sightings in the same city within ±45 days of the same point in the year, across all years            |
| Species vector weight      |    30% | Higher for *Ixodes* (the UK's Lyme borreliosis genus) than *Dermacentor*                              |
| Seasonal questing pressure |    20% | Position on the bimodal UK activity curve — spring peak, midsummer dip, autumn rise, winter trough    |

**The four levels are percentiles, not fixed cut-offs.** This was the result of
measuring rather than guessing: fixed thresholds were tried first and put 0.6% of
sightings in "low" and 4.4% in "severe", which makes three of the four filter
options nearly useless. Percentile breakpoints — recomputed at load time from the
dataset's own score distribution — give 279 / 279 / 271 / 171 across the four
levels, and make the rating's meaning explicit: it is a sighting's standing
**relative to the rest of the dataset**.

The detail panel shows the full breakdown for every sighting, including the
per-component reasoning, because a modelled number the user cannot interrogate is
worse than no number.

### 3. Recency — `src/lib/normalise.ts`

The dataset ends on **30 December 2024**. Measuring recency against the real
clock would mark every record as stale and the indicator would convey nothing. So
the 90-day window is measured back from the **newest record in the data**, and
the UI says exactly that wherever recency appears.

---

## What was built, against the brief

The brief asks for at least two requirements from each of four areas. All twelve
are implemented.

### 1. Interactive map visualisation

- **1a. Dynamic map** — Leaflet + OpenStreetMap, bounded to the British Isles,
  with zoom-aware marker clustering.
- **1b. Markers with visual indicators** — severity drives both fill (a
  lightness-ordered heat ramp) and diameter; recent activity adds a pulsing ring;
  locally reported sightings are square rather than round. Species identity is
  carried in the popup, the detail panel and a fixed colour slot used across
  every chart.
- **1c. Filter controls** — date range, species, severity, city, recency, and own
  reports. Every option shows a **live count of what it would yield given the
  other active filters**, so you can see the data's shape before committing.

### 2. Sighting information

- **2a. Detail panel** — opens on marker click with the full record, the derived
  rating and its breakdown, and species context.
- **2b. Timeline view** — per-year activity within 25 km, bar-scaled, with the
  selected sighting's year highlighted and the peak rating per year colour-coded.
- **2c. Quick actions** — Report a sighting (pre-fills the form from the
  sighting), Get Directions, and Share (Web Share API → clipboard → visible link
  fallback). Sharing produces a `?sighting=<id>` deep link that reopens the panel.

### 3. Education content

- **3a. Species identification guide** — the five species in the dataset, with
  what to look for, size, hosts, habitat and encounter likelihood, each with a
  schematic illustration drawn to show the actual distinguishing characters
  (ornate scutum and festoons for *Dermacentor*, long mouthparts for *Ixodes*).
- **3b. Prevention guidance** — five topics covering before a walk, after a walk,
  safe removal, what to watch for, and reducing ticks around the home.
- **3c. Seasonal activity chart** — monthly columns with **city and year
  dropdowns**, plus an all-year average overlay for comparison when a single year
  is selected. Accompanied by a species breakdown and a yearly trend chart.

### 4. Report a sighting

- **4a. Form** — date, time, location and species, plus optional notes.
- **4b. Validation** — three distinct severities with distinct icons. **Errors**
  block submission; **warnings** do not (a 3am sighting is unusual, not invalid —
  the reporter was there and the app was not); **success** confirms a good value.
  A rejected submit focuses an error summary with in-page links to each problem.
- **4c. Image upload** — drag or pick, with type and size validation, automatic
  downscaling to 1280px, a preview, and a prompt for alt text.

### Extra mile

- **Wireframes** — desktop and mobile, on the About page, drawn as inline SVG so
  they live in the repo as reviewable source and theme with the app.
- **Accessibility** — see below.
- **Light and dark themes**, with a three-state toggle (light / dark / follow OS).
- **A methodology page** documenting every derived value, with live numbers.

---

## Technical choices

| Choice                       | Why, and what was rejected                                                                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **React 19 + TS + Vite**     | Strict TypeScript with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, so the compiler catches the array-access and optional-property mistakes this kind of data wrangling invites. Vite over Next.js: no server, no SEO requirement, no SSR need for a client-side map. |
| **Leaflet + OpenStreetMap**  | No API key and no billing account, so a reviewer can clone and run immediately. Mapbox and Google Maps both gate behind a key.                                                                                     |
| **Hand-rolled clustering**   | `leaflet.markercluster` has no React 19 support, mutates the DOM outside React, and builds icons from HTML strings that design tokens cannot reach. A zoom-aware grid cluster covers this data in ~60 lines and themes correctly. |
| **Plain CSS with tokens**    | One product, one developer — a utility framework would be paid for in markup noise without the payoff. Keeping the validated data colours in named tokens is also what stops the palette drifting as components get copied. |
| **No data-fetching library** | One request, no pagination, no mutations, no cache invalidation. TanStack Query would be right the moment any of that appears; here it would replace about forty lines of `useEffect`.                              |
| **Client-side filtering**    | 1,000 records / ~140 KB. Fetching once makes filters feel instant, enables the live per-option counts, and is kinder to a rate-limited API than a request per filter change.                                        |
| **Recharts**                 | Composable, accessible-by-default SVG, small enough to justify for three charts. D3 would mean hand-building axes, scales and responsiveness for no gain at this complexity. Code-split so it only loads on `/learn`. |

### Project structure

```
src/
  data/        Static reference data (city centroids, species, prevention content)
  lib/         Pure logic — API client, geocoding, severity model, filters,
               aggregations, validation. No React, no DOM, independently testable.
  hooks/       Data provider and theme
  components/  map/ filters/ detail/ charts/ form/ layout/ ui/
  pages/       Map, Learn, Report, About, NotFound
  styles/      tokens.css, base.css, components.css, leaflet.css
```

The deliberate shape here is that **`src/lib` is pure**. Everything that could be
wrong about the data — a coordinate, a score, a date boundary, a validation rule —
is a side-effect-free function taking values and returning values.

---

## Accessibility

Targeting WCAG 2.2 AA. What was actually done:

**Colour.** The severity scale is a **single-hue ramp ordered by lightness**, not
a green-to-red traffic light. The traffic light was the obvious choice, so it was
measured: red against green is **ΔE 4.1 under deuteranopia** — effectively
identical for a large share of male users — and amber against orange fails even
the normal-vision floor at 13.6. Lightness survives colour-vision deficiency, so
the ramp is ordered by it. The five species colours were separately validated
(worst adjacent pair ΔE 9.1 light / 8.4 dark, against a ≥8 target).

Nothing depends on colour alone: severity is also marker **size** and a text
label, trends carry an arrow glyph, and form messages carry a distinct icon per
type. Dark mode is a **selected** palette with its own validated steps, not an
inversion — and one contrast bug found during testing (a dark badge ink left on a
dark tint, measuring 1.14:1) was fixed to 9.9:1.

**Keyboard and screen readers.** Skip link, landmark regions, one `h1` per page.
Map markers are focusable and respond to Enter *and* Space, with accessible names
naming the species, place, date and rating. Filter changes are announced through
a polite live region, since the map conveys nothing to a non-sighted user. Focus
moves to the detail panel when it opens and to the error summary when a submit is
rejected; Escape closes panels and returns focus to the control that opened them.
Route changes update the document title and move focus, which a SPA does not do
on its own.

Every chart has a **table alternative** and states its headline finding in prose
above the plot. 44px minimum touch targets, `:focus-visible` rings,
`prefers-reduced-motion`, and `forced-colors` support throughout.

---

## Known limitations

Stated plainly, because a prototype that hides its edges is harder to review than
one that does not.

- **Reports do not leave the browser.** The Elanco API is read-only (`POST`
  returns `405 Method Not Allowed`) and this submission is frontend-only, so
  reports go to `localStorage`. They appear on the map, in the timelines and in
  the charts, and survive a reload — but only in the browser that made them.
  `src/lib/localReports.ts` is the only module that knows this; swapping it for a
  real backend means reimplementing four functions.
- **Client-side validation is not a security boundary.** With a real backend,
  every rule in `src/lib/validation.ts` and the image type/size limits would need
  re-implementing server-side.
- **Marker positions are approximate by construction** — see above.
- **The dataset's seasonality is flat.** Sightings are spread fairly evenly across
  the calendar, so the seasonal chart does not show the strong spring peak that UK
  tick activity really has. That is a property of the supplied data, and worth
  knowing before drawing conclusions from the chart.
- **Dark-mode map tiles are filtered, not designed.** OSM publishes only a light
  raster style, so dark mode desaturates and inverts it rather than adding a
  second provider. Place labels sit a little lower in contrast than in light mode.
- **No automated test suite.** Effort went into the data layer being correct by
  construction — pure functions in `src/lib` — and into manual verification; the
  severity distribution and the colour palette were both validated with scripts
  during development. Those pure modules are exactly what a Vitest suite would
  target first, and that is the honest next step rather than a claim of coverage.

---

## Content and data notes

The species descriptions are written at the level the sources actually support —
genus-level ecology and morphology — rather than inventing species-level
specifics. Where a claim would need a clinical source I do not have, the entry
says so. Worth noting: *Ixodes ricinus*, the tick most often found on UK pets and
people, does not appear in this dataset at all.

Prevention content reflects standard published UK public-health and veterinary
guidance. It is general education, and the UI pairs it with a visible statement
that it is not veterinary or medical advice.

Risk ratings are **modelled by this application**, not supplied by Elanco.

---

## API reference (as discovered)

Base: `https://dev-task.elancoapps.com/data` — public, read-only, CORS open, rate
limited.

| Endpoint                        | Returns                             |
| ------------------------------- | ----------------------------------- |
| `GET /tick-sightings`           | All 1,000 records                   |
| `GET /tick-sightings/{id}`      | One record                          |
| `GET /tick-sightings/city/{c}`  | Records for one city                |
| `GET /tick-sightings/species/{s}` | Records for one species           |
| `GET /stats`                    | `{ api_version, total_sightings }`  |
| `GET /health`                   | `{ status: "UP" }`                  |

The client handles the rate limit explicitly: a 429 returns a plain-text body
rather than JSON, so a bare `response.json()` would throw a confusing
`SyntaxError` instead of a usable message.

Dataset facts: 14 cities, 5 species (4 *Ixodes*, 1 *Dermacentor*), January 2012 to
December 2024.

---

## Licence

MIT. Map data © OpenStreetMap contributors. Sighting data © Elanco.
