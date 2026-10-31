/**
 * Loading state for the map page.
 *
 * WHY A SKELETON RATHER THAN A SPINNER
 * ------------------------------------
 * A centred spinner says "something is happening" and nothing else. A skeleton
 * says "something is happening, *here is the shape it will take*", which does
 * two measurable things: it makes the wait feel shorter, because the eye has
 * structure to settle on rather than a rotating dot; and it eliminates the
 * layout shift when real content lands, because the space is already reserved.
 *
 * The skeleton mirrors the real layout exactly — sidebar width, summary block,
 * filter groups, toolbar, legend — so the transition to loaded content is a
 * fill rather than a rearrangement.
 *
 * One thing it deliberately does NOT do is fake the map itself with a grey
 * rectangle pretending to be tiles. The canvas gets a plain surface and an
 * honest status message, because a mocked-up map would be a lie about what has
 * loaded.
 */

import { Spinner } from '../ui/primitives';

/** A single shimmer block. Width and height are passed as CSS lengths. */
function Block({
  w,
  h,
  radius = 'var(--radius-md)',
}: {
  w: string;
  h: string;
  radius?: string;
}) {
  return (
    <span
      className="skeleton"
      style={{ display: 'block', width: w, height: h, borderRadius: radius }}
    />
  );
}

export function MapSkeleton() {
  return (
    // aria-hidden because the whole thing is decorative scaffolding; the
    // single live status message below carries the actual announcement.
    <div className="map-page" aria-hidden="true">
      <div className="map-page__sidebar">
        {/* Summary block */}
        <div className="summary" style={{ padding: 'var(--space-4)' }}>
          <div className="stack" style={{ gap: 'var(--space-3)' }}>
            <Block w="40%" h="11px" radius="var(--radius-sm)" />
            <Block w="55%" h="34px" />
            <Block w="80%" h="11px" radius="var(--radius-sm)" />
          </div>
          <div className="stack" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
            {[0, 1, 2].map((row) => (
              <Block key={row} w="100%" h="15px" radius="var(--radius-sm)" />
            ))}
          </div>
        </div>

        {/* Filter groups */}
        <div className="filters">
          <Block w="35%" h="20px" />
          {[0, 1].map((group) => (
            <div key={group} className="stack" style={{ gap: 'var(--space-2)' }}>
              <Block w="45%" h="11px" radius="var(--radius-sm)" />
              <Block w="100%" h="44px" />
              <Block w="100%" h="44px" />
            </div>
          ))}
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            <Block w="30%" h="11px" radius="var(--radius-sm)" />
            {[0, 1, 2, 3, 4].map((option) => (
              <Block key={option} w="100%" h="34px" radius="var(--radius-sm)" />
            ))}
          </div>
        </div>
      </div>

      <div className="map-page__canvas">
        <div className="map-overlay map-overlay--top-left">
          <Block w="260px" h="42px" radius="var(--radius-lg)" />
        </div>

        <div className="map-overlay map-overlay--bottom-left">
          <Block w="240px" h="170px" radius="var(--radius-lg)" />
        </div>

        <div className="map-skeleton__status">
          <p className="loading-panel__title">
            <Spinner label="Loading" /> Loading tick sightings
          </p>
          <p className="text-sm text-muted">
            Fetching 1,000 records from the Elanco API, resolving them to UK
            cities and scoring each one.
          </p>
        </div>
      </div>
    </div>
  );
}
