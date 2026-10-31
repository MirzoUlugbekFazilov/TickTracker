/**
 * Map legend.
 *
 * Present unconditionally. The markers encode severity (fill + diameter),
 * recency (pulse ring) and provenance (circle vs square), none of which is
 * self-explanatory, so the legend is the only thing that makes the map readable
 * — not an optional extra. It also restates that severity is derived, at the
 * point where the user is actually looking at severity.
 */

import { SEVERITY_LEVELS } from '../../types/sighting';
import { SEVERITY_LABELS } from '../../data/species';
import { MARKER_SIZE, severityColor } from '../../lib/colors';
import { RECENT_WINDOW_DAYS } from '../../lib/normalise';

export function MapLegend({ hasLocalReports }: { hasLocalReports: boolean }) {
  return (
    <div className="legend">
      <p className="legend__title" id="legend-heading">
        Derived risk rating
      </p>
      <ul className="legend__items" aria-labelledby="legend-heading">
        {SEVERITY_LEVELS.map((level) => (
          <li key={level} className="legend__item">
            <span
              className="legend__dot"
              style={{
                width: MARKER_SIZE[level],
                height: MARKER_SIZE[level],
                background: severityColor(level),
              }}
              aria-hidden="true"
            />
            {SEVERITY_LABELS[level]}
          </li>
        ))}
      </ul>

      <p className="legend__note">
        Marker size and shade both rise with the rating, so it stays readable
        without relying on colour.
      </p>
      <p className="legend__note">
        A pulsing ring marks the most recent {RECENT_WINDOW_DAYS} days of
        available data.
        {hasLocalReports ? ' Square markers are sightings you reported.' : ''}
      </p>
    </div>
  );
}
