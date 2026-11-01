/**
 * Sightings per region — `GET /api/insights/regions`.
 *
 * This surfaces an endpoint the backend has always had (it answers the brief's
 * "number of sightings per region") but which nothing in the UI was consuming.
 *
 * A horizontal bar list rather than a chart library. The categories are ten
 * long region names, which a vertical chart would have to rotate, and rotated
 * text is measurably slower to read. A bar list also lets every row carry its
 * count and mean severity as real text, so the whole thing is legible to a
 * screen reader without needing a separate table alternative.
 *
 * Bars are a single hue. Length already encodes the magnitude; colouring them
 * by rank as well would be redundant, and colouring them by region would imply
 * a categorical meaning the data does not have.
 */

import { useMemo } from 'react';
import { useSightings } from '../../hooks/sightingsContext';
import { useInsight } from '../../hooks/useInsight';
import { fetchRegionInsights } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { Alert, EmptyState } from '../ui/primitives';
import { SkeletonRows } from './Skeletons';

export function RegionInsights() {
  const { filters } = useSightings();
  const { data, isLoading, error } = useInsight(
    (signal) => fetchRegionInsights(filters, signal),
    [filters],
  );

  const peak = useMemo(
    () => (data ?? []).reduce((max, row) => Math.max(max, row.count), 0),
    [data],
  );

  return (
    <section className="panel" aria-labelledby="regions-heading">
      <header className="panel__head">
        <div>
          <h2 className="panel__title" id="regions-heading">
            Sightings by region
          </h2>
          <p className="panel__subtitle">
            Grouped in SQL from <code>/api/insights/regions</code>
          </p>
        </div>
      </header>

      <div className="panel__body">
        {error ? (
          <Alert tone="error" title="Could not load regional insights">
            {error}
          </Alert>
        ) : isLoading && data === null ? (
          <SkeletonRows rows={6} />
        ) : (data ?? []).length === 0 ? (
          <EmptyState icon="search" title="No regions match">
            Nothing is recorded for the current filters.
          </EmptyState>
        ) : (
          <ol className="region-list">
            {(data ?? []).map((row) => {
              const percent = peak === 0 ? 0 : (row.count / peak) * 100;
              return (
                <li key={row.region} className="region-row">
                  <span className="region-row__name">{row.region}</span>

                  <span className="region-row__track" aria-hidden="true">
                    <span
                      className="region-row__bar"
                      style={{ width: `${Math.max(percent, 1.5)}%` }}
                    />
                  </span>

                  <span className="region-row__count tabular">
                    {formatNumber(row.count)}
                    {/* The visual bar is aria-hidden, so the numbers a
                        screen reader needs are spelled out here instead. */}
                    <span className="sr-only">
                      {' '}
                      sightings across {row.cities}{' '}
                      {row.cities === 1 ? 'city' : 'cities'}, mean derived
                      severity {row.averageSeverity} out of 100.
                    </span>
                  </span>

                  <span className="region-row__meta" aria-hidden="true">
                    {row.cities} {row.cities === 1 ? 'city' : 'cities'} &middot; avg{' '}
                    {row.averageSeverity}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
