/**
 * Headline numbers for the filtered set, shown above the filters.
 *
 * Placed in the sidebar rather than in a strip across the top of the page: the
 * map needs every pixel of height it can get, and the sidebar is already a
 * scrollable column. The tiles update with the filters, so they double as
 * feedback on what the current selection actually contains.
 *
 * The trend tile compares the most recent window in the data against the one
 * before it, and is omitted entirely when there is too little history to make
 * that comparison meaningful — see `computeTrend`.
 */

import { useMemo } from 'react';
import type { Sighting } from '../../types/sighting';
import { Stat } from '../ui/primitives';
import { cityCounts, computeTrend, peakMonth, speciesCounts } from '../../lib/stats';
import { MONTH_NAMES } from '../../lib/severity';
import { RECENT_WINDOW_DAYS } from '../../lib/normalise';
import { formatNumber } from '../../lib/format';

export function DatasetSummary({
  sightings,
  latestTimestamp,
}: {
  sightings: readonly Sighting[];
  latestTimestamp: number;
}) {
  const summary = useMemo(() => {
    const topCity = cityCounts(sightings)[0];
    const topSpecies = speciesCounts(sightings)[0];
    const peak = peakMonth(sightings);
    const trend = computeTrend(sightings, latestTimestamp, RECENT_WINDOW_DAYS);
    const recent = sightings.filter((sighting) => sighting.isRecent).length;
    return { topCity, topSpecies, peak, trend, recent };
  }, [sightings, latestTimestamp]);

  return (
    <div style={{ padding: 'var(--space-4) var(--space-4) 0' }}>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <Stat
          label="Sightings shown"
          value={formatNumber(sightings.length)}
          {...(summary.trend
            ? {
                delta: {
                  direction: summary.trend.direction,
                  text:
                    summary.trend.direction === 'flat'
                      ? 'level'
                      : `${Math.abs(summary.trend.changePercent)}%`,
                },
                meta: `Last ${RECENT_WINDOW_DAYS} days of data vs the ${RECENT_WINDOW_DAYS} before`,
              }
            : { meta: `${formatNumber(summary.recent)} in the most recent ${RECENT_WINDOW_DAYS} days` })}
        />

        <Stat
          label="Busiest location"
          value={summary.topCity?.city ?? '—'}
          meta={
            summary.topCity
              ? `${formatNumber(summary.topCity.count)} sightings`
              : 'No sightings in the current selection'
          }
        />

        <Stat
          label="Commonest species"
          value={summary.topSpecies?.species ?? '—'}
          meta={
            summary.topSpecies
              ? `${formatNumber(summary.topSpecies.count)} sightings`
              : undefined
          }
        />

        <Stat
          label="Peak month"
          value={summary.peak ? (MONTH_NAMES[summary.peak.monthIndex] ?? '—') : '—'}
          meta={summary.peak ? `${formatNumber(summary.peak.count)} sightings` : undefined}
        />
      </div>
    </div>
  );
}
