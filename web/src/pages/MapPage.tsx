/**
 * The map page: filters, map, detail panel.
 *
 * URL AS STATE
 * The selected sighting lives in the query string (`?sighting=<id>`), not only
 * in component state. That makes the Share quick action produce a link that
 * actually reopens what it shared, and makes Back behave the way a user
 * expects. Filters stay in component state: encoding five filter dimensions
 * into the URL on every checkbox tick would flood the history stack and make
 * Back useless.
 *
 * Filtering itself is now a server round trip (see SightingsProvider), so the
 * previous results stay on screen while a new set loads rather than the map
 * blanking between keystrokes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSightings } from '../hooks/sightingsContext';
import { FilterPanel } from '../components/filters/FilterPanel';
import { DatasetSummary } from '../components/filters/DatasetSummary';
import { SightingsMap } from '../components/map/SightingsMap';
import { MapLegend } from '../components/map/MapLegend';
import { MapSkeleton } from '../components/map/MapSkeleton';
import { SightingDetailPanel } from '../components/detail/SightingDetailPanel';
import { Icon } from '../components/ui/Icon';
import { Alert, EmptyState } from '../components/ui/primitives';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';
import { activeFilterCount, describeFilters } from '../lib/display';

/** `YYYY-MM-DD HH:MM:SS` -> `YYYY-MM-DD`, for the date inputs' bounds. */
function toDateOnly(value: string | null, fallback: string): string {
  return value ? value.slice(0, 10) : fallback;
}

export function MapPage() {
  const {
    state,
    isFetching,
    sightings,
    total,
    facets,
    meta,
    filters,
    setFilters,
    resetFilters,
    error,
    retry,
    localReportCount,
    removeReport,
  } = useSightings();

  const [searchParams, setSearchParams] = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const filterToggleRef = useRef<HTMLButtonElement>(null);

  const activeCount = useMemo(() => activeFilterCount(filters), [filters]);
  const selectedId = searchParams.get('sighting');

  /**
   * Resolved from the currently loaded set. A sighting filtered out while its
   * panel is open keeps the panel open until the user closes it — having it
   * vanish mid-read is disorienting.
   */
  const selected = useMemo(
    () => (selectedId ? (sightings.find((s) => s.id === selectedId) ?? null) : null),
    [selectedId, sightings],
  );

  const select = useCallback(
    (id: string | null) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (id === null) next.delete('sighting');
          else next.set('sighting', id);
          return next;
        },
        // Replace rather than push: clicking through ten markers should not
        // require ten presses of Back to leave the page.
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        filterToggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  const handleDelete = useCallback(
    (id: string) => {
      void removeReport(id)
        .then(() => setToast('Your report was deleted.'))
        .catch(() => setToast('That report could not be deleted.'));
    },
    [removeReport],
  );

  /* --------------------------------------------------------- Error state */

  if (state === 'error' && error) {
    return (
      <div className="container page">
        <Alert tone="error" title="Could not load the sightings data" live="assertive">
          <p>{error.message}</p>
          <p style={{ marginTop: 'var(--space-3)' }}>
            Check that the API is running on port 4000 &mdash; <code>npm run dev</code>{' '}
            in <code>server/</code> &mdash; and that its database is reachable.
          </p>
          {error.retryable ? (
            <p style={{ marginTop: 'var(--space-3)' }}>
              <button type="button" className="btn btn--primary btn--sm" onClick={retry}>
                Try again
              </button>
            </p>
          ) : null}
        </Alert>

        <div style={{ marginTop: 'var(--space-6)' }}>
          <p className="prose">
            The map needs the API to render anything, so there is no partial view
            to fall back to. The{' '}
            <Link to="/learn">identification and prevention guides</Link> do not
            depend on it and are still available.
          </p>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------- Loading state */

  if (state === 'loading') {
    return (
      <>
        <MapSkeleton />
        {/* The skeleton is aria-hidden scaffolding, so the announcement lives
            here — one polite message rather than a screen reader walking a
            dozen placeholder blocks. */}
        <p className="sr-only" role="status">
          Loading tick sightings from the TickTrack API.
        </p>
      </>
    );
  }

  const minDate = toDateOnly(meta?.dateRange.earliest ?? null, '2012-01-01');
  const maxDate = toDateOnly(meta?.dateRange.latest ?? null, '2024-12-31');

  /* ----------------------------------------------------------------- Map */

  return (
    <div className="map-page">
      {sidebarOpen ? (
        <button
          type="button"
          className="scrim"
          aria-label="Close filters"
          onClick={() => {
            setSidebarOpen(false);
            filterToggleRef.current?.focus();
          }}
        />
      ) : null}

      <div className="map-page__sidebar" data-open={sidebarOpen} aria-label="Filter sightings">
        <DatasetSummary />

        <FilterPanel
          filters={filters}
          onChange={setFilters}
          onReset={resetFilters}
          facets={facets}
          resultCount={total}
          datasetTotal={meta?.totalSightings ?? total}
          speciesPresent={(meta?.species ?? []).map((s) => s.name).sort((a, b) => a.localeCompare(b, 'en-GB'))}
          citiesPresent={(meta?.cities ?? []).map((c) => c.name).sort((a, b) => a.localeCompare(b, 'en-GB'))}
          minDate={minDate}
          maxDate={maxDate}
          recentWindowDays={meta?.recentWindowDays ?? 90}
          localReportCount={localReportCount}
          isFetching={isFetching}
          onClose={() => {
            setSidebarOpen(false);
            filterToggleRef.current?.focus();
          }}
        />
      </div>

      <div className="map-page__canvas">
        <SightingsMap
          sightings={sightings}
          selected={selected}
          onSelect={(sighting) => select(sighting.id)}
          resetToken={resetToken}
        />

        {/* --------------------------------------------------- Toolbar */}
        <div className="map-overlay map-overlay--top-left">
          <div className="map-toolbar">
            {/* `.filters-toggle` is hidden above 1100px, where the filter
                column is permanently visible and a toggle would be a no-op. */}
            <button
              ref={filterToggleRef}
              type="button"
              className="map-chip map-chip--button filters-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-expanded={sidebarOpen}
            >
              <Icon name="filter" size={16} />
              Filters
              {activeCount > 0 ? <span className="map-chip__badge">{activeCount}</span> : null}
            </button>

            {/* Hidden from assistive tech: the same count is announced, with
                its filter context, by the live region at the foot of the page. */}
            <p className="map-chip" aria-hidden="true">
              <Icon name="map-pin" size={16} />
              <AnimatedNumber value={total} className="map-chip__count" />
              <span className="map-chip__label-optional">shown</span>
            </p>

            <button
              type="button"
              className="map-chip map-chip--button"
              onClick={() => setResetToken((value) => value + 1)}
              aria-label="Reset the map to the whole United Kingdom"
            >
              <Icon name="crosshair" size={16} />
              <span className="map-chip__label-optional">Reset view</span>
            </button>
          </div>
        </div>

        {/* ---------------------------------------------------- Legend */}
        <div className="map-overlay map-overlay--bottom-left">
          <MapLegend
            hasLocalReports={localReportCount > 0}
            recentWindowDays={meta?.recentWindowDays ?? 90}
          />
        </div>

        {/* ------------------------------------------- Empty result set */}
        {sightings.length === 0 && !isFetching ? (
          <div
            className="map-overlay map-overlay--top-right"
            style={{ maxWidth: 'min(340px, calc(100% - 2rem))' }}
          >
            <div className="card">
              <div className="card__body">
                <EmptyState icon="search" title="No sightings match">
                  Every record is filtered out. Widen the date range or clear a
                  species or rating filter.
                </EmptyState>
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  onClick={resetFilters}
                >
                  Clear all filters
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ---------------------------------------------- Detail panel */}
        {selected ? (
          <SightingDetailPanel
            sighting={selected}
            visibleSightings={sightings}
            onClose={() => select(null)}
            onNotify={setToast}
            {...(selected.source === 'user' ? { onDelete: handleDelete } : {})}
          />
        ) : null}
      </div>

      {/* One polite live region for filter results. Announcing the count after
          a change is the only way a non-sighted user learns what their filter
          did, since the map itself conveys nothing to them. */}
      <p className="sr-only" role="status" aria-live="polite">
        {describeFilters(filters, total)}
      </p>

      {toast ? (
        <p className="toast" role="status">
          <Icon name="check-circle" size={18} className="toast__icon" />
          {toast}
        </p>
      ) : null}
    </div>
  );
}
