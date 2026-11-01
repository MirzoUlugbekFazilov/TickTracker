/**
 * The dashboard — the landing surface.
 *
 * Previously the map was the landing page, which meant the first thing a
 * visitor saw was a control surface: 1,000 markers and six filter groups, with
 * no statement of what the data says. The map is the right tool for
 * exploration and the wrong one for orientation.
 *
 * This page answers "what is in this dataset and what does it show" before
 * handing over to the map. It is also where the regional aggregate finally
 * appears: `/api/insights/regions` existed on the backend from the start and
 * nothing in the UI consumed it.
 *
 * HIERARCHY
 * One headline figure, then four supporting stats, then two panels of
 * substance (region breakdown, recent sightings), then the long trend. Each
 * tier is visually quieter than the one above it, so the eye lands on the
 * total first and works down rather than scanning a uniform grid of cards.
 */

import { Link } from 'react-router-dom';
import tickOnGrass from '../assets/tick-on-grass.jpg';
import { useSightings } from '../hooks/sightingsContext';
import { useInsight } from '../hooks/useInsight';
import { fetchSummary } from '../lib/api';
import { RegionInsights } from '../components/dashboard/RegionInsights';
import { RecentSightings } from '../components/dashboard/RecentSightings';
import { SkeletonStat } from '../components/dashboard/Skeletons';
import { YearlyTrendChart } from '../components/charts/YearlyTrendChart';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';
import { Icon } from '../components/ui/Icon';
import { Alert, Stat } from '../components/ui/primitives';
import { MONTH_NAMES } from '../lib/display';
import { formatNumber } from '../lib/format';

/** `YYYY-MM-DD HH:MM:SS` -> `YYYY`. */
function year(value: string | null | undefined): string | null {
  return value ? value.slice(0, 4) : null;
}

export function DashboardPage() {
  const { meta, filters, state, error, retry } = useSightings();

  const { data: summary, isLoading } = useInsight(
    (signal) => fetchSummary(filters, signal),
    [filters],
  );

  const recentWindow = meta?.recentWindowDays ?? 90;
  const from = year(meta?.dateRange.earliest);
  const to = year(meta?.dateRange.latest);
  const loadingStats = isLoading && summary === null;

  if (state === 'error' && error) {
    return (
      <div className="container page">
        <Alert tone="error" title="Could not load the sightings data" live="assertive">
          <p>{error.message}</p>
          {error.retryable ? (
            <p style={{ marginTop: 'var(--space-3)' }}>
              <button type="button" className="btn btn--primary btn--sm" onClick={retry}>
                Try again
              </button>
            </p>
          ) : null}
        </Alert>
      </div>
    );
  }

  return (
    <div className="container page dashboard">
      {/* ------------------------------------------------------- headline */}
      <header className="dashboard__head">
        <div className="dashboard__intro">
          <span className="eyebrow">UK tick surveillance</span>
          <h1 className="dashboard__title">
            Where ticks are being found across the UK
          </h1>
          <p className="dashboard__lede">
            Crowdsourced sightings from the Elanco dataset, enriched with
            coordinates and a derived risk rating, so pet owners and vets can see
            local activity and contribute their own records.
          </p>

          <div className="dashboard__actions">
            <Link to="/map" className="btn btn--primary">
              <Icon name="map-pin" size={18} />
              Explore the map
            </Link>
            <Link to="/report" className="btn btn--secondary">
              <Icon name="plus-circle" size={18} />
              Report a sighting
            </Link>
          </div>
        </div>

        {/* The subject, then the one number that frames everything else.
            Photograph and figure share a frame because they answer the same
            question together: what this is, and how much of it there is. */}
        <figure className="dashboard__feature">
          <img
            className="dashboard__feature-image"
            src={tickOnGrass}
            /* Intrinsic size, so the browser reserves the box before the
               image arrives and the headline below it does not jump. */
            width={465}
            height={279}
            alt="A tick on the edge of a grass blade with its front legs raised, the questing posture it uses to catch onto a passing animal."
          />

          <figcaption className="dashboard__feature-caption">
            Questing: a tick waits on the tip of the vegetation with its front
            legs outstretched. It does not jump or fly &mdash; it holds on to
            whatever brushes past.
          </figcaption>

          <div className="dashboard__headline">
            <span className="dashboard__headline-label">Sightings recorded</span>
            <AnimatedNumber
              value={summary?.total ?? 0}
              className="dashboard__headline-value"
            />
            <span className="dashboard__headline-meta">
              {from && to ? `${from} to ${to}` : 'across the dataset'}
              {meta?.lastIngest
                ? ` · last ingest ${meta.lastIngest.status}, ${formatNumber(
                    meta.lastIngest.rejected,
                  )} rejected`
                : ''}
            </span>
          </div>
        </figure>
      </header>

      {/* ---------------------------------------------------------- stats */}
      <section aria-label="Headline statistics" className="section">
        <div className="stat-grid">
          {loadingStats ? (
            <>
              <SkeletonStat />
              <SkeletonStat />
              <SkeletonStat />
              <SkeletonStat />
            </>
          ) : (
            <>
              <Stat
                label={`Recent (${recentWindow} days)`}
                value={formatNumber(summary?.recent ?? 0)}
                meta={`Counted back from the newest record, not from today`}
              />
              <Stat
                label="Busiest location"
                value={summary?.busiestCity?.name ?? '—'}
                meta={
                  summary?.busiestCity
                    ? `${formatNumber(summary.busiestCity.count)} sightings`
                    : undefined
                }
              />
              <Stat
                label="Commonest species"
                value={summary?.commonestSpecies?.name ?? '—'}
                meta={
                  summary?.commonestSpecies
                    ? `${formatNumber(summary.commonestSpecies.count)} sightings`
                    : undefined
                }
              />
              <Stat
                label="Peak month"
                value={
                  summary?.peakMonth
                    ? (MONTH_NAMES[summary.peakMonth.month - 1] ?? '—')
                    : '—'
                }
                meta={
                  summary?.peakMonth
                    ? `${formatNumber(summary.peakMonth.count)} sightings`
                    : undefined
                }
              />
            </>
          )}
        </div>
      </section>

      {/* ------------------------------------------------- two-panel row */}
      <section className="section dashboard__panels">
        <RegionInsights />
        <RecentSightings />
      </section>

      {/* ---------------------------------------------------------- trend */}
      <section className="section" aria-label="Reports over time">
        <YearlyTrendChart
          filters={filters}
          title="Reports per year"
          subtitle="Every city and species in the current selection"
        />
      </section>

      {/* ------------------------------------------------------- footnote */}
      <section className="section">
        <Alert tone="info" title="How the risk ratings are produced">
          <p>
            Severity is <strong>modelled by this application</strong>, not
            supplied by Elanco &mdash; the source API carries no severity field.
            Each score combines local activity density, a species vector
            weighting and seasonal questing pressure, and the four levels are
            percentiles of the dataset&rsquo;s own distribution.{' '}
            <Link to="/about">The method is documented in full</Link>.
          </p>
        </Alert>
      </section>
    </div>
  );
}
