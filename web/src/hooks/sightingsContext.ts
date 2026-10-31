/**
 * The context object and its accessor hook, kept separate from the provider
 * component so React Fast Refresh keeps working (a module exporting both a
 * component and a non-component defeats it, forcing a full reload and losing
 * the loaded dataset on every edit).
 */

import { createContext, useContext } from 'react';
import type {
  Facets,
  Filters,
  MetaResponse,
  NewSightingPayload,
  Sighting,
} from '../types/sighting';
import type { FieldIssue } from '../lib/api';

export type LoadState = 'loading' | 'ready' | 'error';

export interface SightingsError {
  message: string;
  retryable: boolean;
  details?: FieldIssue[];
}

export interface SightingsContextValue {
  /** Reflects the first load only; later filter changes use `isFetching`. */
  state: LoadState;
  /**
   * True while a filter change is in flight. The previous results stay on
   * screen meanwhile, so the map does not blank out between keystrokes.
   */
  isFetching: boolean;

  sightings: Sighting[];
  /** Total matching the current filters, which may exceed what was returned. */
  total: number;
  /** Per-option counts for the current filter context, computed server-side. */
  facets: Facets;
  /** Reference data: cities, species, severity breakpoints, date range. */
  meta: MetaResponse | null;

  filters: Filters;
  setFilters: (filters: Filters) => void;
  resetFilters: () => void;

  error: SightingsError | null;
  retry: () => void;

  /** Count of user-submitted sightings currently loaded. */
  localReportCount: number;

  addReport: (payload: NewSightingPayload) => Promise<Sighting>;
  removeReport: (id: string) => Promise<void>;
}

export const SightingsContext = createContext<SightingsContextValue | null>(null);

export function useSightings(): SightingsContextValue {
  const context = useContext(SightingsContext);
  if (context === null) {
    throw new Error('useSightings must be used inside a SightingsProvider');
  }
  return context;
}
