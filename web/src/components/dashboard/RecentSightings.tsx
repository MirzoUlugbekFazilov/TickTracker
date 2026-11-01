/**
 * The newest sightings in the current selection.
 *
 * Reads from the data the provider already holds rather than issuing another
 * request: the sightings list is returned sorted newest-first by the API, so
 * "recent" is the head of an array that is in memory anyway. Fetching it again
 * would be a round trip for a slice.
 *
 * Each row links into the map with `?sighting=<id>`, which is the same deep
 * link the Share action produces — so the dashboard, the map and a shared URL
 * all agree on what "open this sighting" means.
 */

import { Link } from 'react-router-dom';
import { useSightings } from '../../hooks/sightingsContext';
import { SeverityBadge } from '../ui/primitives';
import { EmptyState } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { SkeletonList } from './Skeletons';
import { formatDateShort } from '../../lib/format';
import { sightingTimestamp } from '../../types/sighting';
import { speciesColor } from '../../lib/colors';

const HOW_MANY = 7;

export function RecentSightings() {
  const { sightings, state, isFetching } = useSightings();
  const recent = sightings.slice(0, HOW_MANY);

  return (
    <section className="panel" aria-labelledby="recent-heading">
      <header className="panel__head">
        <div>
          <h2 className="panel__title" id="recent-heading">
            Most recent sightings
          </h2>
          <p className="panel__subtitle">Newest first, within the current filters</p>
        </div>
        <Link to="/map" className="btn btn--sm btn--secondary">
          Open map
          <Icon name="arrow-right" size={15} />
        </Link>
      </header>

      <div className="panel__body">
        {state === 'loading' ? (
          <SkeletonList rows={HOW_MANY} />
        ) : recent.length === 0 ? (
          <EmptyState icon="search" title="Nothing to show">
            No sightings match the current filters.
          </EmptyState>
        ) : (
          <ul className="recent-list stagger" style={{ opacity: isFetching ? 0.6 : 1 }}>
            {recent.map((sighting, index) => (
              <li key={sighting.id} style={{ ['--i' as string]: index }}>
                <Link
                  to={`/map?sighting=${encodeURIComponent(sighting.id)}`}
                  className="recent-row"
                >
                  <span
                    className="recent-row__dot"
                    style={{ background: speciesColor(sighting.species) }}
                    aria-hidden="true"
                  />

                  <span className="recent-row__main">
                    <span className="recent-row__species">{sighting.species}</span>
                    <span className="recent-row__meta">
                      {sighting.location}
                      {sighting.region ? ` · ${sighting.region}` : ''} &middot;{' '}
                      {formatDateShort(sightingTimestamp(sighting))}
                    </span>
                  </span>

                  {sighting.source === 'user' ? (
                    <span className="badge badge--brand">Reported</span>
                  ) : null}

                  <SeverityBadge level={sighting.severityLevel} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
