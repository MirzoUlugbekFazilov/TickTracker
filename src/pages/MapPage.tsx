/**
 * The map page: filters, map, detail panel.
 *
 * URL AS STATE
 * ------------
 * The selected sighting lives in the query string (`?sighting=<id>`), not only
 * in component state. That makes the Share quick action produce a link that
 * actually reopens the thing it shared, and makes the browser back button
 * behave the way a user expects. Filters stay in component state: encoding five
 * filter dimensions into the URL on every checkbox tick would flood the history
 * stack and make Back useless.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSightings } from '../hooks/sightingsContext';
import { FilterPanel } from '../components/filters/FilterPanel';
import { DatasetSummary } from '../components/filters/DatasetSummary';
import { SightingsMap } from '../components/map/SightingsMap';
import { MapLegend } from '../components/map/MapLegend';
import { SightingDetailPanel } from '../components/detail/SightingDetailPanel';
import { Icon } from '../components/ui/Icon';
import { Alert, EmptyState, Spinner } from '../components/ui/primitives';
import { EMPTY_FILTERS, applyFilters, describeFilters } from '../lib/filters';
import type { Filters } from '../types/sighting';
import { formatNumber } from '../lib/format';

export function MapPage() {
  const { state, dataset, error, retry, reports, removeReport } = useSightings();
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY_FILTERS }));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const filterToggleRef = useRef<HTMLButtonElement>(null);

  const context = useMemo(
    () => ({ recentSince: dataset.recentSince }),
    [dataset.recentSince],
  );

  const visible = useMemo(
    () => applyFilters(dataset.sightings, filters, context),
    [dataset.sightings, filters, context],
  );

  const selectedId = searchParams.get('sighting');

  /**
   * The selected sighting is resolved from the full dataset, not from `visible`.
   * Otherwise changing a filter after opening a sighting would make the panel
   * vanish mid-read, which is disorienting — better to keep it open and let the
   * user close it deliberately.
   */
  const selected = useMemo(
    () => (selectedId ? dataset.sightings.find((s) => s.id === selectedId) ?? null : null),
    [selectedId, dataset.sightings],
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

  // Auto-dismiss the toast.
  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Close the mobile filter sheet on Escape, and restore focus to the button
  // that opened it.
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

  const resetFilters = useCallback(() => setFilters({ ...EMPTY_FILTERS }), []);

  /* --------------------------------------------------------- Error state */

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

        <div style={{ marginTop: 'var(--space-6)' }}>
          <p className="prose">
            The map needs the Elanco API to render anything, so there is no
            partial view to fall back to. The{' '}
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
      <div className="loading-panel">
        <p className="loading-panel__title">
          <Spinner label="Loading" /> Loading tick sightings
        </p>
        <p>Fetching 1,000 records from the Elanco API and mapping them to the UK.</p>
      </div>
    );
  }

  /* ----------------------------------------------------------------- Map */

  return (
    <div className="map-page">
      {/* Mobile scrim. A button rather than a div so it is reachable and
          dismissible without a pointer. */}
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

      <div
        className="map-page__sidebar"
        data-open={sidebarOpen}
        /* Hidden from assistive tech while the sheet is closed on mobile, so a
           screen reader does not read out a panel that is off-screen. The
           desktop layout always has it visible, where this attribute is false. */
        aria-label="Filter sightings"
      >
        <DatasetSummary sightings={visible} latestTimestamp={dataset.latestTimestamp} />

        <FilterPanel
          filters={filters}
          onChange={setFilters}
          onReset={resetFilters}
          allSightings={dataset.sightings}
          resultCount={visible.length}
          speciesPresent={dataset.speciesPresent}
          citiesPresent={dataset.citiesPresent}
          earliestTimestamp={dataset.earliestTimestamp}
          latestTimestamp={dataset.latestTimestamp}
          recentSince={dataset.recentSince}
          localReportCount={reports.length}
          onClose={() => {
            setSidebarOpen(false);
            filterToggleRef.current?.focus();
          }}
        />
      </div>

      <div className="map-page__canvas">
        <SightingsMap
          sightings={visible}
          selected={selected}
          onSelect={(sighting) => select(sighting.id)}
          resetToken={resetToken}
        />

        {/* --------------------------------------------------- Toolbar */}
        <div className="map-overlay map-overlay--top-left">
          <div className="map-toolbar">
            {/* `.filters-toggle` is display:none above 1100px, where the filter
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
            </button>

            <p className="map-chip" aria-hidden="true">
              <Icon name="map-pin" size={16} />
              <span className="map-chip__count">{formatNumber(visible.length)}</span>
              shown
            </p>

            <button
              type="button"
              className="map-chip map-chip--button"
              onClick={() => setResetToken((value) => value + 1)}
            >
              <Icon name="crosshair" size={16} />
              Reset view
            </button>
          </div>
        </div>

        {/* ---------------------------------------------------- Legend */}
        <div className="map-overlay map-overlay--bottom-left">
          <MapLegend hasLocalReports={reports.length > 0} />
        </div>

        {/* ------------------------------------------- Empty result set */}
        {visible.length === 0 ? (
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
            visibleSightings={visible}
            latestTimestamp={dataset.latestTimestamp}
            onClose={() => select(null)}
            onNotify={setToast}
            {...(selected.source === 'local' ? { onDelete: removeReport } : {})}
          />
        ) : null}
      </div>

      {/* A single polite live region for filter results. Announcing the count
          after a change is the only way a non-sighted user learns what their
          filter did, since the map itself conveys nothing to them. */}
      <p className="sr-only" role="status" aria-live="polite">
        {describeFilters(filters, visible.length)}
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
