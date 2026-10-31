/**
 * The app's single source of sighting data.
 *
 * WHY A CONTEXT AND NOT A DATA-FETCHING LIBRARY
 * ---------------------------------------------
 * There is exactly one server request in this application: fetch the 1,000
 * records once. There is no pagination, no mutation round-trip, no cache
 * invalidation and no refetch-on-focus requirement. TanStack Query or SWR would
 * be the right call the moment any of that appears, but for a single immutable
 * fetch they add a dependency to replace about forty lines of `useEffect`. The
 * trade-off is noted in the README as a deliberate choice rather than an
 * oversight.
 *
 * What this provider does own, and why it is worth centralising:
 *
 *  - The enrichment pass (coordinates, severity, recency) is O(n) over 1,000
 *    records with an O(sum of city sizes squared) index build inside it. Doing
 *    that once here, memoised, keeps it off the render path of four pages.
 *  - Severity is *dataset-relative*, so API records and local reports must be
 *    scored together in one pass. Two independent fetches would produce two
 *    incomparable scales.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, fetchAllSightings, fetchStats } from '../lib/api';
import { buildDataset, type Dataset } from '../lib/normalise';
import {
  deleteReport as deleteStoredReport,
  loadReports,
  saveReport,
} from '../lib/localReports';
import type { ApiStats, LocalReport, RawSighting } from '../types/sighting';
import {
  SightingsContext,
  type LoadState,
  type SightingsContextValue,
} from './sightingsContext';

const EMPTY_DATASET: Dataset = {
  sightings: [],
  latestTimestamp: Date.now(),
  earliestTimestamp: Date.now(),
  recentSince: Date.now(),
  breakpoints: { moderate: 0, high: 0, severe: 0 },
  maxWindowCount: 1,
  speciesPresent: [],
  citiesPresent: [],
  yearsPresent: [],
  severityCounts: { low: 0, moderate: 0, high: 0, severe: 0 },
};

export function SightingsProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<RawSighting[] | null>(null);
  const [stats, setStats] = useState<ApiStats | null>(null);
  const [error, setError] = useState<SightingsContextValue['error']>(null);
  const [reports, setReports] = useState<LocalReport[]>(() => loadReports());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // Guards against a late response from a superseded attempt overwriting a
    // newer one — the out-of-order-response bug when a user hits Retry twice.
    // The effect's own cleanup flips this, so no ref is needed: each run gets
    // its own `cancelled` binding and the stale run's writes are dropped.
    let cancelled = false;

    void (async () => {
      try {
        // Both requests go out together; stats is the cheaper of the two and is
        // only used for a reconciliation note, so it must never block the map.
        const [sightings, statsResult] = await Promise.all([
          fetchAllSightings(controller.signal),
          fetchStats(controller.signal).catch(() => null),
        ]);

        if (cancelled) return;
        setRaw(sightings);
        setStats(statsResult);
        setError(null);
      } catch (caught) {
        if (cancelled || controller.signal.aborted) return;

        if (caught instanceof ApiError) {
          setError({ message: caught.message, retryable: caught.retryable });
        } else {
          setError({
            message: 'Something went wrong loading the sightings data.',
            retryable: true,
          });
        }
        setRaw(null);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt]);

  // The expensive derivation. Recomputes only when the fetched data or the set
  // of local reports changes — not on every render, and not when a filter moves.
  const dataset = useMemo<Dataset>(() => {
    if (raw === null) return EMPTY_DATASET;
    return buildDataset(raw, reports);
  }, [raw, reports]);

  // Clearing the error here rather than at the top of the fetch effect keeps
  // the effect free of a synchronous setState, which would cascade a render.
  const retry = useCallback(() => {
    setError(null);
    setAttempt((value) => value + 1);
  }, []);

  const addReport = useCallback((input: Omit<LocalReport, 'id' | 'submittedAt'>) => {
    const saved = saveReport(input);
    setReports((current) => [...current, saved]);
    return saved;
  }, []);

  const removeReport = useCallback((id: string) => {
    deleteStoredReport(id);
    setReports((current) => current.filter((report) => report.id !== id));
  }, []);

  const state: LoadState = raw !== null ? 'ready' : error !== null ? 'error' : 'loading';

  const value = useMemo<SightingsContextValue>(
    () => ({ state, dataset, error, stats, reports, retry, addReport, removeReport }),
    [state, dataset, error, stats, reports, retry, addReport, removeReport],
  );

  return <SightingsContext.Provider value={value}>{children}</SightingsContext.Provider>;
}
