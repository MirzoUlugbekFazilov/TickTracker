/**
 * About / methodology.
 *
 * This page exists because the app makes two claims a reviewer should be able
 * to audit: the markers are at positions the API never supplied, and the
 * severity ratings are computed rather than reported. Burying that in a README
 * would be the wrong place for it — the person reading a risk rating is the
 * person who needs to know how it was reached.
 */

import { Link } from 'react-router-dom';
import { useSightings } from '../hooks/sightingsContext';
import { useInsight } from '../hooks/useInsight';
import { fetchSummary } from '../lib/api';
import { MapWireframe, MobileWireframe } from '../components/Wireframes';
import { Icon } from '../components/ui/Icon';
import { Alert, Disclosure, Stat } from '../components/ui/primitives';
import { API_BASE_URL } from '../lib/api';
import { SEVERITY_METHODOLOGY } from '../lib/display';
import { SEVERITY_LABELS } from '../data/species';
import { SEVERITY_LEVELS } from '../types/sighting';
import { formatNumber, formatPercent } from '../lib/format';
import { CITIES } from '../data/cities';

export function AboutPage() {
  const { meta, filters, state } = useSightings();

  // The severity counts and the dataset's own figures come from the aggregate
  // endpoint rather than from the rows this page happens to be holding.
  const { data: summary } = useInsight((signal) => fetchSummary(filters, signal), [filters]);

  const recentWindowDays = meta?.recentWindowDays ?? 90;
  const latestLabel = meta?.dateRange.latest?.slice(0, 10) ?? 'the end of the dataset';
  const earliestYear = meta?.dateRange.earliest?.slice(0, 4) ?? '2012';
  const latestYear = meta?.dateRange.latest?.slice(0, 4) ?? '2024';

  return (
    <div className="container page">
      <header className="page__header">
        <span className="eyebrow">About</span>
        <h1 className="page__title">How this was built, and what it assumes</h1>
        <p className="section-intro">
          TickTrack UK is a prototype built for the Elanco placement programme
          technical task by Mirzo-Ulugbek Fazilov. This page documents the data,
          the parts of it that are modelled rather than measured, and the design
          decisions behind the interface.
        </p>
      </header>

      {/* =================================================== The dataset */}
      <section className="section" aria-labelledby="data-heading">
        <h2 className="section-heading" id="data-heading">
          The data
        </h2>
        <p className="section-intro" style={{ marginBottom: 'var(--space-5)' }}>
          One request to{' '}
          <a href={API_BASE_URL} target="_blank" rel="noopener noreferrer">
            {API_BASE_URL}
          </a>
          . The Elanco dataset is ingested into PostgreSQL by that API, which
          enriches it with coordinates and a derived risk rating. Filtering and
          every aggregate below run as SQL on the server &mdash; this page only
          renders what it is sent.
        </p>

        {state === 'ready' ? (
          <div className="stat-grid" style={{ marginBottom: 'var(--space-5)' }}>
            <Stat
              label="Records loaded"
              value={formatNumber(meta?.totalSightings ?? 0)}
              meta={
                meta?.lastIngest
                  ? `Last ingest ${meta.lastIngest.status}: ${formatNumber(
                      meta.lastIngest.fetched,
                    )} fetched, ${formatNumber(meta.lastIngest.rejected)} rejected`
                  : 'No ingest recorded yet'
              }
            />
            <Stat
              label="Date range"
              value={`${earliestYear}–${latestYear}`}
              meta={`Newest record ${latestLabel}`}
            />
            <Stat
              label="Cities"
              value={String(meta?.cities.length ?? 0)}
              meta="Each resolved to a centroid in this app"
            />
            <Stat
              label="Species"
              value={String(meta?.species.length ?? 0)}
              meta="Four Ixodes, one Dermacentor"
            />
          </div>
        ) : null}

        <h3 style={{ marginBottom: 'var(--space-3)' }}>What the API actually returns</h3>
        <div className="scroll-x">
          <table className="data-table">
            <caption>
              Every field in a sighting record. There are five, and three of the
              things the brief asks the map to show are not among them.
            </caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col" style={{ textAlign: 'start' }}>
                  Example
                </th>
                <th scope="col" style={{ textAlign: 'start' }}>
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">id</th>
                <td style={{ textAlign: 'start' }} className="font-mono text-xs">
                  02WNholuSg6ndCk4c1dA
                </td>
                <td style={{ textAlign: 'start' }}>Opaque 20-character key, unique.</td>
              </tr>
              <tr>
                <th scope="row">date</th>
                <td style={{ textAlign: 'start' }} className="font-mono text-xs">
                  2022-08-01T06:40:31
                </td>
                <td style={{ textAlign: 'start' }}>
                  ISO-8601 with no timezone designator, so read as local time.
                </td>
              </tr>
              <tr>
                <th scope="row">location</th>
                <td style={{ textAlign: 'start' }}>Manchester</td>
                <td style={{ textAlign: 'start' }}>
                  A bare city name. No coordinates anywhere in the payload.
                </td>
              </tr>
              <tr>
                <th scope="row">species</th>
                <td style={{ textAlign: 'start' }}>Marsh tick</td>
                <td style={{ textAlign: 'start' }}>Common name, one of five.</td>
              </tr>
              <tr>
                <th scope="row">latinName</th>
                <td style={{ textAlign: 'start' }} className="italic">
                  Ixodes apronophorus
                </td>
                <td style={{ textAlign: 'start' }}>
                  Maps one-to-one onto the common name.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 'var(--space-5)' }}>
          <Alert tone="warning" title="Three gaps between the brief and the data">
            <p>
              The brief asks for markers indicating <strong>severity</strong>,{' '}
              <strong>recent activity</strong> and <strong>species</strong>, plus
              a severity filter. Only species is in the payload. Coordinates,
              severity and any notion of "recent" had to be derived. Each is
              documented below, and the app labels them as derived wherever they
              appear rather than presenting them as source data.
            </p>
          </Alert>
        </div>
      </section>

      {/* ================================================= Coordinates */}
      <section className="section" aria-labelledby="geo-heading">
        <h2 className="section-heading" id="geo-heading">
          1. Where the markers come from
        </h2>
        <div className="prose">
          <p>
            Each of the 14 city names is resolved against a table of city-centre
            coordinates held in <code>src/data/cities.ts</code>. A live geocoding
            service would have added an API key, a rate limit and a network
            dependency to render the core view, for a set of place names that is
            fixed and known in advance.
          </p>
          <p>
            Plotting all 72 Manchester records on one pixel would collapse them
            into a single marker and discard the fact that there are 72, so each
            sighting is offset from its city centroid by a small amount derived
            from a hash of its own id. Two properties matter: the offset is{' '}
            <strong>deterministic</strong>, so a sighting lands on the same spot
            in every browser and on every load and deep links stay valid; and it
            is <strong>bounded to about 6 km</strong>, the footprint of the city
            itself, so it never implies street-level precision the source data
            does not have.
          </p>
          <p>
            Consequently the &ldquo;Get directions&rdquo; action routes to the
            city centre, not to the plotted marker. Navigating someone to a
            hash-derived point would send them to a spot with no relationship to
            the sighting at all.
          </p>
        </div>

        <Disclosure summary={`The 14 city centroids used`}>
          <div className="scroll-x">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">City</th>
                  <th scope="col">Latitude</th>
                  <th scope="col">Longitude</th>
                  <th scope="col" style={{ textAlign: 'start' }}>
                    Region
                  </th>
                </tr>
              </thead>
              <tbody>
                {CITIES.map((city) => (
                  <tr key={city.name}>
                    <th scope="row">{city.name}</th>
                    <td>{city.lat.toFixed(4)}</td>
                    <td>{city.lng.toFixed(4)}</td>
                    <td style={{ textAlign: 'start' }}>{city.region}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Disclosure>
      </section>

      {/* ==================================================== Severity */}
      <section className="section" aria-labelledby="severity-heading">
        <h2 className="section-heading" id="severity-heading">
          2. The derived risk rating
        </h2>

        <Alert tone="info" title="This is a model, not a measurement">
          The API has no severity field. Every rating in this app is computed from
          the data that is present, and describes relative local exposure within
          this dataset. It is not a clinical grading of a case.
        </Alert>

        <div className="prose" style={{ marginTop: 'var(--space-4)' }}>
          <p>
            Each sighting scores 0&ndash;100 from three weighted components, all
            derived from real fields:
          </p>
        </div>

        <div className="scroll-x" style={{ marginTop: 'var(--space-4)' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col">Weight</th>
                <th scope="col" style={{ textAlign: 'start' }}>
                  What it measures
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Local activity density</th>
                <td>{formatPercent(SEVERITY_METHODOLOGY.weights.density)}</td>
                <td style={{ textAlign: 'start' }}>
                  Sightings in the same city within{' '}
                  {SEVERITY_METHODOLOGY.windowDays} days of the same point in the
                  year, across all years. The strongest real signal in the data:
                  repeated reports at the same point in the season mean reliable
                  activity. Normalised against the busiest city-and-window, which
                  holds the busiest city-and-window count.
                </td>
              </tr>
              <tr>
                <th scope="row">Species vector weight</th>
                <td>{formatPercent(SEVERITY_METHODOLOGY.weights.species)}</td>
                <td style={{ textAlign: 'start' }}>
                  Higher for <em>Ixodes</em>, the genus that transmits Lyme
                  borreliosis in the UK, than for <em>Dermacentor</em>. A
                  precautionary genus-level judgement, with its limits stated per
                  species in the <Link to="/learn">identification guide</Link>.
                </td>
              </tr>
              <tr>
                <th scope="row">Seasonal questing pressure</th>
                <td>{formatPercent(SEVERITY_METHODOLOGY.weights.season)}</td>
                <td style={{ textAlign: 'start' }}>
                  Position on the bimodal UK activity curve &mdash; a spring peak,
                  a midsummer dip, an autumn rise and a winter trough.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)' }}>
          Why the four levels are percentiles
        </h3>
        <div className="prose">
          <p>
            Fixed cut-offs were tried first and distributed badly on the real
            1,000 records: 0.6% of sightings landed in &ldquo;low&rdquo; and 4.4%
            in &ldquo;severe&rdquo;, which makes three of the four filter options
            nearly useless. The boundaries are therefore percentiles of the
            dataset&rsquo;s own score distribution, recomputed at load time.
          </p>
        </div>

        <div className="scroll-x" style={{ marginTop: 'var(--space-4)' }}>
          <table className="data-table">
            <caption>
              Live boundaries for the currently loaded data, including any
              sightings you have reported.
            </caption>
            <thead>
              <tr>
                <th scope="col">Level</th>
                <th scope="col">Target share</th>
                <th scope="col">Score from</th>
                <th scope="col">Records</th>
              </tr>
            </thead>
            <tbody>
              {SEVERITY_LEVELS.map((level) => (
                <tr key={level}>
                  <th scope="row">
                    <span className="row" style={{ gap: 'var(--space-2)' }}>
                      <span
                        className="swatch swatch--round"
                        style={{ background: `var(--severity-${level})` }}
                        aria-hidden="true"
                      />
                      {SEVERITY_LABELS[level]}
                    </span>
                  </th>
                  <td>{formatPercent(SEVERITY_METHODOLOGY.levelShares[level])}</td>
                  <td>
                    {level === 'low'
                      ? '0'
                      : formatNumber(
                          meta?.severityBreakpoints[level as 'moderate' | 'high' | 'severe'] ?? 0,
                        )}
                  </td>
                  <td>{formatNumber(summary?.severityCounts[level] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===================================================== Recency */}
      <section className="section" aria-labelledby="recency-heading">
        <h2 className="section-heading" id="recency-heading">
          3. What &ldquo;recent&rdquo; means here
        </h2>
        <div className="prose">
          <p>
            The dataset ends on {latestLabel}. Measuring
            recency against the real clock would therefore mark every single
            record as stale and the indicator would convey nothing at all.
          </p>
          <p>
            Instead the {recentWindowDays}-day window is measured back from the{' '}
            <strong>newest record in the data</strong>. The UI says so wherever
            recency appears, so the pulsing ring is never mistaken for
            &ldquo;seen in the last {recentWindowDays} days from today&rdquo;.
          </p>
        </div>
      </section>

      {/* ================================================= Wireframes */}
      <section className="section" aria-labelledby="wireframes-heading">
        <h2 className="section-heading" id="wireframes-heading">
          Wireframes
        </h2>
        <p className="section-intro" style={{ marginBottom: 'var(--space-5)' }}>
          Drawn as inline SVG so they live in the repository as reviewable source
          and theme with the rest of the app.
        </p>

        <h3 style={{ marginBottom: 'var(--space-3)' }}>Desktop map screen</h3>
        <div className="wireframe">
          <MapWireframe />
        </div>
        <div className="prose" style={{ marginTop: 'var(--space-4)' }}>
          <p>
            Three columns. Filters are permanently visible rather than behind a
            button: exploration is the primary task, and hiding the controls for
            it behind a click would make the whole dataset feel inert. Summary
            tiles sit above the filters in the same scrollable column, because the
            map needs every pixel of height and the sidebar had room.
          </p>
          <p>
            The detail panel is a non-modal <code>complementary</code> region, not
            a dialog. The map stays live behind it so a user can click a second
            marker to compare, which focus-trapping would prevent.
          </p>
        </div>

        <h3 style={{ marginTop: 'var(--space-8)', marginBottom: 'var(--space-3)' }}>
          Mobile screens
        </h3>
        <div className="wireframe">
          <MobileWireframe />
        </div>
        <div className="prose" style={{ marginTop: 'var(--space-4)' }}>
          <p>
            Below 1100px the filter column becomes a slide-over sheet with a
            dismissing scrim. Below 640px the detail panel becomes a bottom sheet
            capped at 82% height, because a 420px side panel on a phone leaves no
            map visible at all. Navigation stays a scrollable strip rather than a
            hamburger: with four destinations a drawer costs an extra tap for no
            benefit.
          </p>
        </div>
      </section>

      {/* ============================================== Accessibility */}
      <section className="section" aria-labelledby="a11y-heading">
        <h2 className="section-heading" id="a11y-heading">
          Accessibility
        </h2>
        <p className="section-intro" style={{ marginBottom: 'var(--space-5)' }}>
          Targeting WCAG 2.2 AA. What was actually done, rather than a claim of
          compliance:
        </p>

        <div className="two-col">
          <div className="card">
            <div className="card__body">
              <h3 className="card__title" style={{ marginBottom: 'var(--space-3)' }}>
                Colour and contrast
              </h3>
              <ul className="spec-list">
                <li className="spec-list__item">
                  <span className="spec-list__bullet" aria-hidden="true" />
                  Body text meets 4.5:1 and large text 3:1 in both themes. Primary
                  ink is 15.8:1 on white.
                </li>
                <li className="spec-list__item">
                  <span className="spec-list__bullet" aria-hidden="true" />
                  The severity ramp is a single hue ordered by lightness. The
                  obvious green-to-red traffic light was measured and rejected:
                  red against green is ΔE 4.1 under deuteranopia, effectively
                  identical for a large share of male users.
                </li>
                <li className="spec-list__item">
                  <span className="spec-list__bullet" aria-hidden="true" />
                  The five species colours were validated for colour-blind
                  separation (worst adjacent pair ΔE 9.1 light, 8.4 dark).
                </li>
                <li className="spec-list__item">
                  <span className="spec-list__bullet" aria-hidden="true" />
                  Nothing depends on colour alone: severity is also marker size
                  and a text label, trends carry an arrow glyph, and form
                  messages carry distinct icons per type.
                </li>
                <li className="spec-list__item">
                  <span className="spec-list__bullet" aria-hidden="true" />
                  Dark mode is a selected palette with its own validated steps,
                  not an inversion.
                </li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card__body">
              <h3 className="card__title" style={{ marginBottom: 'var(--space-3)' }}>
                Keyboard and screen readers
              </h3>
              <ul className="spec-list">
                <li className="spec-list__item">
                  <span className="spec-list__bullet" aria-hidden="true" />
                  A skip link, landmark regions and one <code>h1</code> per page
                  with a correct heading order.
                </li>
                <li className="spec-list__item">
                  <span className="spec-list__bullet" aria-hidden="true" />
                  Map markers are focusable and respond to both Enter and Space,
                  each with a descriptive accessible name naming the species,
                  place, date and rating.
                </li>
                <li className="spec-list__item">
                  <span className="spec-list__bullet" aria-hidden="true" />
                  Filter changes are announced through a polite live region, since
                  the map conveys nothing to a non-sighted user.
                </li>
                <li className="spec-list__item">
                  <span className="spec-list__bullet" aria-hidden="true" />
                  Focus moves to the detail panel when it opens and to the error
                  summary when a submit is rejected; Escape closes panels and
                  returns focus to the control that opened them.
                </li>
                <li className="spec-list__item">
                  <span className="spec-list__bullet" aria-hidden="true" />
                  Every chart has a table alternative, and each one states its
                  headline finding in prose above the plot.
                </li>
                <li className="spec-list__item">
                  <span className="spec-list__bullet" aria-hidden="true" />
                  44px minimum touch targets, visible focus rings via{' '}
                  <code>:focus-visible</code>, a{' '}
                  <code>prefers-reduced-motion</code> path, and{' '}
                  <code>forced-colors</code> support.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================ Known limitations */}
      <section className="section" aria-labelledby="limits-heading">
        <h2 className="section-heading" id="limits-heading">
          Known limitations
        </h2>
        <p className="section-intro" style={{ marginBottom: 'var(--space-5)' }}>
          Stated plainly, because a prototype that hides its edges is harder to
          review than one that does not.
        </p>

        <div className="stack">
          <Alert tone="warning" title="Reports do not leave the browser">
            The Elanco API is read-only, and this submission is frontend-only, so
            submitted sightings are held in <code>localStorage</code>. They are
            visible only in the browser that created them and are lost if site
            data is cleared.
          </Alert>

          <Alert tone="warning" title="Marker positions are approximate by construction">
            The source data is city-accurate. Markers carry a deterministic
            offset of up to 6 km purely so same-city sightings do not stack, and
            they should not be read as the location of an individual tick.
          </Alert>

          <Alert tone="warning" title="The dataset's seasonality is flat">
            Sightings are spread fairly evenly across the calendar, so the
            seasonal chart does not show the strong spring peak that UK tick
            activity really has. That is a property of the supplied data, and
            worth knowing before drawing seasonal conclusions from the chart.
          </Alert>

          <Alert tone="warning" title="Dark-mode map tiles are filtered, not designed">
            OpenStreetMap publishes only a light raster style. Dark mode applies a
            CSS filter to those tiles rather than adding a second provider, so
            place labels sit a little lower in contrast than in light mode.
          </Alert>

          <Alert tone="warning" title="No automated test suite">
            With the time available, effort went into the data layer being
            correct by construction — pure, side-effect-free functions in{' '}
            <code>src/lib</code> — and into manual verification. The severity
            distribution and the colour palette were both validated with scripts
            during development. Those pure modules are exactly what a Vitest suite
            would target first, and that is the honest next step rather than a
            claim of coverage.
          </Alert>
        </div>
      </section>

      {/* ===================================================== Stack */}
      <section className="section" aria-labelledby="stack-heading">
        <h2 className="section-heading" id="stack-heading">
          Technical choices
        </h2>

        <div className="scroll-x">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Choice</th>
                <th scope="col" style={{ textAlign: 'start' }}>
                  Why, and what was rejected
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">React 19 + TypeScript + Vite</th>
                <td style={{ textAlign: 'start' }}>
                  Strict TypeScript with <code>noUncheckedIndexedAccess</code> and{' '}
                  <code>exactOptionalPropertyTypes</code>, so the compiler catches
                  the array-access and optional-property mistakes that this kind of
                  data wrangling invites. Vite over Next.js: there is no server, no
                  SEO requirement and no need for SSR on a client-side map.
                </td>
              </tr>
              <tr>
                <th scope="row">Leaflet + OpenStreetMap</th>
                <td style={{ textAlign: 'start' }}>
                  No API key and no billing account, so a reviewer can clone and
                  run this immediately. Mapbox and Google Maps both gate behind a
                  key.
                </td>
              </tr>
              <tr>
                <th scope="row">Hand-rolled clustering</th>
                <td style={{ textAlign: 'start' }}>
                  <code>leaflet.markercluster</code> has no React 19 support,
                  mutates the DOM outside React, and builds icons from HTML strings
                  that design tokens cannot reach. A zoom-aware grid cluster covers
                  this data in about sixty lines and themes correctly.
                </td>
              </tr>
              <tr>
                <th scope="row">Plain CSS with tokens</th>
                <td style={{ textAlign: 'start' }}>
                  One product, one developer: a utility framework would be paid for
                  in markup noise without the payoff. Keeping the validated data
                  colours in named tokens is also what stops the palette drifting
                  as components get copied.
                </td>
              </tr>
              <tr>
                <th scope="row">No data-fetching library</th>
                <td style={{ textAlign: 'start' }}>
                  There is one request, no pagination, no mutations and no cache
                  invalidation. TanStack Query would be right the moment any of
                  that appears; here it would replace about forty lines of{' '}
                  <code>useEffect</code>.
                </td>
              </tr>
              <tr>
                <th scope="row">Client-side filtering</th>
                <td style={{ textAlign: 'start' }}>
                  The payload is 1,000 records and roughly 140 KB. Fetching it once
                  makes filters feel instant, enables the live per-option result
                  counts, and is kinder to a rate-limited API than a request per
                  filter change.
                </td>
              </tr>
              <tr>
                <th scope="row">Recharts</th>
                <td style={{ textAlign: 'start' }}>
                  Composable, accessible-by-default SVG output, and small enough
                  to justify for three charts. D3 would mean hand-building axes,
                  scales and responsiveness for no gain at this complexity.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="row">
          <Link to="/" className="btn btn--primary btn--lg">
            <Icon name="map-pin" size={18} />
            Back to the map
          </Link>
          <Link to="/learn" className="btn btn--secondary btn--lg">
            <Icon name="book" size={18} />
            Identification guide
          </Link>
        </div>
      </section>
    </div>
  );
}
