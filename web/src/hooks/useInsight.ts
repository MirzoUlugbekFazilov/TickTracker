/**
 * Fetches one aggregate endpoint.
 *
 * The charts previously reduced the full in-memory dataset. They now ask the
 * server, which does the GROUP BY in SQL — the same change as moving filtering
 * server-side, for the same reason: counting a thousand rows in JavaScript is
 * fine, counting ten million is not, and the SQL version does not change when
 * the data grows.
 *
 * Handles the three things any fetch-on-dependency-change needs and that are
 * easy to get subtly wrong:
 *
 *   - **Cancellation.** The previous request is aborted when dependencies
 *     change, so a slow response cannot overwrite a newer one.
 *   - **Keep-previous-data.** The last successful result stays on screen while
 *     refetching, so a chart does not flash empty on every filter change.
 *   - **A stable fetcher.** The caller passes a function; it must be memoised
 *     or the effect re-runs forever. The `deps` array exists so callers can be
 *     explicit about that rather than relying on reference equality.
 */

import { useEffect, useRef, useState, type DependencyList } from 'react';

export interface InsightState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

export function useInsight<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
): InsightState<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guards against an out-of-order response winning: only the most recently
  // issued request is allowed to write state.
  const requestId = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++requestId.current;
    setIsLoading(true);

    void (async () => {
      try {
        const result = await fetcher(controller.signal);
        if (controller.signal.aborted || id !== requestId.current) return;
        setData(result);
        setError(null);
      } catch (caught) {
        if (controller.signal.aborted || id !== requestId.current) return;
        setError(caught instanceof Error ? caught.message : 'Could not load this chart.');
      } finally {
        if (!controller.signal.aborted && id === requestId.current) setIsLoading(false);
      }
    })();

    return () => controller.abort();
    // The fetcher is intentionally excluded: callers pass an inline closure,
    // and including it would re-run on every render. `deps` is the contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, isLoading, error };
}
