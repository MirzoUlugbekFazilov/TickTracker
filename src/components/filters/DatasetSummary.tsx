/**
 * Headline numbers for the filtered set, shown above the filters.
 *
 * LAYOUT RATIONALE
 * ----------------
 * This was a 2x2 grid of equal tiles. Two problems with that, both visible as
 * soon as it held real data: in a 336px sidebar the tiles were ~150px wide, so
 * "Nottingham" clipped and "Passerine tick" wrapped to three lines; and four
 * unrelated figures at identical visual weight meant none of them led.
 *
 * The fix is hierarchy. One hero metric — the count, which is the number that
 * responds to every filter and therefore the one people watch — then three
 * supporting facts as key/value rows. Scanning a right-aligned value column is
 * faster than hunting figures inside boxes, and long names finally have room.
 *
 * The count animates between values (see AnimatedNumber) because it is the
 * primary feedback that a filter did something.
 */

import { useMemo } from 'react';
import type { Sighting } from '../../types/sighting';
import { Icon } from '../ui/Icon';
import { AnimatedNumber } from '../ui/AnimatedNumber';
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

  const { trend } = summary;

  return (
    <section className="summary animate-fade" aria-label="Summary of the current selection">
      <div className="summary__hero">
        <span className="summary__label">Sightings shown</span>

        <p className="summary__figure">
          <AnimatedNumber value={sightings.length} className="summary__value" />

          {trend ? (
            <span className={`stat__delta stat__delta--${trend.direction}`}>
              {/* An arrow glyph as well as the colour, so direction survives
                  in greyscale and for a colourblind reader. */}
              <Icon
                name={
                  trend.direction === 'up'
                    ? 'arrow-up'
                    : trend.direction === 'down'
                      ? 'arrow-down'
                      : 'minus'
                }
                size={13}
              />
              {trend.direction === 'flat'
                ? 'level'
                : `${Math.abs(trend.changePercent)}%`}
            </span>
          ) : null}
        </p>

        <span className="summary__meta">
          {trend
            ? `Last ${RECENT_WINDOW_DAYS} days of data against the ${RECENT_WINDOW_DAYS} before`
            : `${formatNumber(summary.recent)} in the most recent ${RECENT_WINDOW_DAYS} days of data`}
        </span>
      </div>

      <dl className="summary__rows">
        <div className="summary__row">
          <dt className="summary__row-label">Busiest location</dt>
          <dd className="summary__row-value">
            {summary.topCity?.city ?? '—'}
            {summary.topCity ? (
              <span className="summary__row-sub">
                {formatNumber(summary.topCity.count)} sightings
              </span>
            ) : null}
          </dd>
        </div>

        <div className="summary__row">
          <dt className="summary__row-label">Commonest species</dt>
          <dd className="summary__row-value">
            {summary.topSpecies?.species ?? '—'}
            {summary.topSpecies ? (
              <span className="summary__row-sub">
                {formatNumber(summary.topSpecies.count)} sightings
              </span>
            ) : null}
          </dd>
        </div>

        <div className="summary__row">
          <dt className="summary__row-label">Peak month</dt>
          <dd className="summary__row-value">
            {summary.peak ? (MONTH_NAMES[summary.peak.monthIndex] ?? '—') : '—'}
            {summary.peak ? (
              <span className="summary__row-sub">
                {formatNumber(summary.peak.count)} sightings
              </span>
            ) : null}
          </dd>
        </div>
      </dl>
    </section>
  );
}
