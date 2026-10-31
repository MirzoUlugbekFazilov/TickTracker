/**
 * Loads sightings from the API and owns filter state.
 *
 * WHY FILTERING MOVED TO THE SERVER
 * It used to fetch all 1,000 records once and filter in the browser. That was
 * the right call for a frontend-only build, and it is the wrong call now: the
 * brief asks for an API that filters by time range and location, and a client
 * that downloads the whole table to narrow it defeats the point and stops
 * working the moment the table is larger than a browser tab.
 *
 * The cost of moving it is a round trip per filter change, and that is what
 * the debounce and the "keep previous results" behaviour below are for.
 *
 * WHY STILL NO DATA-FETCHING LIBRARY
 * TanStack Query would be a good fit here, and it is a close call now that
 * there are several endpoints and a mutation. It is still not pulled in
 * because what this component actually needs — debounce, cancellation,
 * keep-previous-data — is about fifty lines, and those fifty lines are
 * explicit about an ordering bug that is easy to get wrong (see below). The
 * README records this as a decision with a trigger for revisiting it.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  createSighting,
  deleteSighting,
  fetchMeta,
  fetchSightings,
} from '../lib/api';
import {
  SightingsContext,
  type LoadState,
  type SightingsContextValue,
  type SightingsError,
} from './sightingsContext';
import type {
  Facets,
  Filters,
  MetaResponse,
  NewSightingPayload,
  Sighting,
} from '../types/sighting';
import { EMPTY_FILTERS } from '../lib/display';

const EMPTY_FACETS: Facets = {
  species: {},
  severity: { low: 0, moderate: 0, high: 0, severe: 0 },
  city: {},
};

/**
 * Debounce for filter changes.
 *
 * 220ms is chosen to sit just above the gap between keystrokes in a date field
 * but below the point where a checkbox tick feels unresponsive. Without it,
 * typing "2024-01-01" into a date input fires ten requests and the last one to
 * arrive wins, which is not necessarily the one you asked for.
 */
const FILTER_DEBOUNCE_MS = 220;

function toError(error: unknown): SightingsError {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      retryable: error.retryable,
      ...(error.details ? { details: error.details } : {}),
    };
  }
  return {
    message: 'Something went wrong loading the sightings data.',
    retryable: true,
  };
}

export function SightingsProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<Facets>(EMPTY_FACETS);

  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY_FILTERS }));
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<SightingsError | null>(null);
  const [attempt, setAttempt] = useState(0);

  /**
   * Monotonic request counter.
   *
   * This is the ordering bug a fetching library would hide: responses can
   * arrive out of order, so a slow request for filter A can land after a fast
   * one for filter B and overwrite it with stale results. Every response is
   * checked against the latest issued id before it is allowed to write state.
   */
  const requestId = useRef(0);

  /* ---------------------------------------------------- reference data */

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const result = await fetchMeta(controller.signal);
        if (!controller.signal.aborted) setMeta(result);
      } catch (caught) {
        if (controller.signal.aborted) return;
        // Meta failing is usually the API being down entirely, which the
        // sightings request below will report. Recorded, not duplicated.
        console.warn('[meta] could not load reference data:', caught);
      }
    })();

    return () => controller.abort();
  }, [attempt]);

  /* -------------------------------------------------------- sightings */

  useEffect(() => {
    const controller = new AbortController();
    const id = ++requestId.current;

    // The first load should be immediate; only subsequent filter changes are
    // debounced. Waiting 220ms before the very first request just makes the
    // app feel slower to start.
    const delay = hasLoadedOnce ? FILTER_DEBOUNCE_MS : 0;

    const timer = setTimeout(() => {
      setIsFetching(true);

      void (async () => {
        try {
          const result = await fetchSightings(filters, controller.signal);
          // Discard a response that has been superseded.
          if (controller.signal.aborted || id !== requestId.current) return;

          setSightings(result.data);
          setTotal(result.meta.total);
          setFacets(result.facets);
          setError(null);
          setHasLoadedOnce(true);
        } catch (caught) {
          if (controller.signal.aborted || id !== requestId.current) return;
          setError(toError(caught));
        } finally {
          if (!controller.signal.aborted && id === requestId.current) {
            setIsFetching(false);
          }
        }
      })();
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `hasLoadedOnce` is deliberately not a dependency: including it would
    // re-run the effect the moment the first load completes, firing a
    // duplicate request for the same filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, attempt]);

  /* ----------------------------------------------------------- actions */

  const retry = useCallback(() => {
    setError(null);
    setAttempt((value) => value + 1);
  }, []);

  const resetFilters = useCallback(() => setFilters({ ...EMPTY_FILTERS }), []);

  /**
   * Submits a report and refreshes.
   *
   * The refresh is a re-fetch rather than a local splice, because the server
   * rescores the dataset when a report is added — a new sighting can shift the
   * density component of its neighbours and move the dataset's date range.
   * Patching the array locally would leave the map subtly out of date.
   */
  const addReport = useCallback(async (payload: NewSightingPayload) => {
    const created = await createSighting(payload);
    setAttempt((value) => value + 1);
    return created;
  }, []);

  const removeReport = useCallback(async (id: string) => {
    await deleteSighting(id);
    setAttempt((value) => value + 1);
  }, []);

  const localReportCount = useMemo(
    () => sightings.filter((sighting) => sighting.source === 'user').length,
    [sightings],
  );

  const state: LoadState = hasLoadedOnce
    ? 'ready'
    : error !== null
      ? 'error'
      : 'loading';

  const value = useMemo<SightingsContextValue>(
    () => ({
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
      addReport,
      removeReport,
    }),
    [
      state,
      isFetching,
      sightings,
      total,
      facets,
      meta,
      filters,
      resetFilters,
      error,
      retry,
      localReportCount,
      addReport,
      removeReport,
    ],
  );

  return <SightingsContext.Provider value={value}>{children}</SightingsContext.Provider>;
}
