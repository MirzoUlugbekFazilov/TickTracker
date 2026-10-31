/**
 * Headline numbers for the current filter, from `GET /api/insights/summary`.
 *
 * These used to be reduced from the in-memory dataset. They are now a single
 * aggregate query — Postgres does the counting with `FILTER (WHERE ...)`
 * clauses in one pass, which is both faster and correct for a dataset larger
 * than the page is holding.
 *
 * LAYOUT
 * One hero metric and three supporting rows, rather than the 2x2 grid of equal
 * tiles this started as. That grid gave four ~150px boxes in a 336px sidebar,
 * which clipped "Nottingham" and wrapped "Passerine tick" over three lines —
 * and, worse, gave four unrelated figures identical visual weight so none of
 * them led. The count animates between values because it is the primary
 * feedback that a filter did something.
 */

import { useSightings } from '../../hooks/sightingsContext';
import { useInsight } from '../../hooks/useInsight';
import { fetchSummary } from '../../lib/api';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { MONTH_NAMES } from '../../lib/display';
import { formatNumber } from '../../lib/format';

export function DatasetSummary() {
  const { filters, meta } = useSightings();
  const recentWindowDays = meta?.recentWindowDays ?? 90;

  const { data: summary } = useInsight(
    (signal) => fetchSummary(filters, signal),
    [filters],
  );

  const total = summary?.total ?? 0;

  return (
    <section className="summary animate-fade" aria-label="Summary of the current selection">
      <div className="summary__hero">
        <span className="summary__label">Sightings shown</span>

        <p className="summary__figure">
          <AnimatedNumber value={total} className="summary__value" />
        </p>

        <span className="summary__meta">
          {formatNumber(summary?.recent ?? 0)} in the most recent {recentWindowDays} days
          of available data
        </span>
      </div>

      <dl className="summary__rows">
        <div className="summary__row">
          <dt className="summary__row-label">Busiest location</dt>
          <dd className="summary__row-value">
            {summary?.busiestCity?.name ?? '—'}
            {summary?.busiestCity ? (
              <span className="summary__row-sub">
                {formatNumber(summary.busiestCity.count)} sightings
              </span>
            ) : null}
          </dd>
        </div>

        <div className="summary__row">
          <dt className="summary__row-label">Commonest species</dt>
          <dd className="summary__row-value">
            {summary?.commonestSpecies?.name ?? '—'}
            {summary?.commonestSpecies ? (
              <span className="summary__row-sub">
                {formatNumber(summary.commonestSpecies.count)} sightings
              </span>
            ) : null}
          </dd>
        </div>

        <div className="summary__row">
          <dt className="summary__row-label">Peak month</dt>
          <dd className="summary__row-value">
            {summary?.peakMonth ? (MONTH_NAMES[summary.peakMonth.month - 1] ?? '—') : '—'}
            {summary?.peakMonth ? (
              <span className="summary__row-sub">
                {formatNumber(summary.peakMonth.count)} sightings
              </span>
            ) : null}
          </dd>
        </div>
      </dl>
    </section>
  );
}
