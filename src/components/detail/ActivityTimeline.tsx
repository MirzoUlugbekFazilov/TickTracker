/**
 * Activity progression for the area around a selected sighting.
 *
 * Built as a labelled bar list rather than a charting-library component. At this
 * size (a 400px panel, up to 13 rows) a bar list is more legible than a plotted
 * chart, it needs no axis chrome, and each row can carry its year, count, peak
 * rating and species mix as real text — which means the whole thing is readable
 * by a screen reader without a separate table alternative.
 */

import type { Sighting } from '../../types/sighting';
import { AREA_RADIUS_KM, buildAreaTimeline, timelinePeak } from '../../lib/stats';
import { severityColor } from '../../lib/colors';
import { SEVERITY_LABELS } from '../../data/species';
import { formatNumber } from '../../lib/format';
import { EmptyState } from '../ui/primitives';

export function ActivityTimeline({
  areaSightings,
  focus,
}: {
  areaSightings: readonly Sighting[];
  focus: Sighting;
}) {
  const buckets = buildAreaTimeline(areaSightings);
  const peak = timelinePeak(buckets);

  if (buckets.length === 0) {
    return (
      <EmptyState icon="chart" title="No activity to chart">
        Nothing else has been recorded within {AREA_RADIUS_KM} km of this
        location under the current filters.
      </EmptyState>
    );
  }

  const focusYear = new Date(focus.timestamp).getFullYear();
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  return (
    <div>
      <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
        {formatNumber(total)} {total === 1 ? 'sighting' : 'sightings'} recorded
        within {AREA_RADIUS_KM} km of {focus.location}, by year. Bars are scaled
        against the busiest year shown.
      </p>

      <ol className="timeline">
        {buckets.map((bucket) => {
          const widthPercent = peak === 0 ? 0 : (bucket.count / peak) * 100;
          const isFocusYear = bucket.year === focusYear;
          const topSpecies = bucket.species[0];

          return (
            <li key={bucket.year} className="timeline__row">
              <span className="timeline__year">
                {bucket.year}
                {isFocusYear ? (
                  <>
                    {/* Marks the row the selected sighting belongs to. The
                        visual cue is the brand-coloured bar; this is its
                        text equivalent. */}
                    <span className="sr-only"> (year of the selected sighting)</span>
                  </>
                ) : null}
              </span>

              <span
                className="timeline__bar"
                style={{
                  width: `${Math.max(widthPercent, 2)}%`,
                  background: isFocusYear
                    ? 'var(--brand)'
                    : severityColor(bucket.peakSeverity),
                }}
                aria-hidden="true"
              />

              <span className="timeline__count">
                {bucket.count}
                <span className="sr-only">
                  {' '}
                  sightings. Highest derived rating that year:{' '}
                  {SEVERITY_LABELS[bucket.peakSeverity]}.
                  {topSpecies
                    ? ` Most frequent species: ${topSpecies.species}, ${topSpecies.count} of them.`
                    : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <p className="timeline__meta" style={{ marginTop: 'var(--space-3)' }}>
        Bar colour shows the highest derived rating reached that year. The
        highlighted bar is the year of the selected sighting.
      </p>
    </div>
  );
}
