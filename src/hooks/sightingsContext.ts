/**
 * The context object and its accessor hook, kept separate from the provider
 * component.
 *
 * Not an arbitrary split: a module that exports both a component and a
 * non-component breaks React Fast Refresh, so editing the provider would force
 * a full page reload and lose the loaded dataset every time. Splitting the hook
 * out keeps hot reloading working during development.
 */

import { createContext, useContext } from 'react';
import type { Dataset } from '../lib/normalise';
import type { ApiStats, LocalReport } from '../types/sighting';

export type LoadState = 'loading' | 'ready' | 'error';

export interface SightingsContextValue {
  state: LoadState;
  /**
   * Enriched dataset. Empty but non-null while loading, so pages can render
   * their skeletons against a real shape instead of guarding on undefined.
   */
  dataset: Dataset;
  /** Populated when `state` is `error`. */
  error: { message: string; retryable: boolean } | null;
  /** `GET /stats`, used to confirm the client received the full dataset. */
  stats: ApiStats | null;
  reports: LocalReport[];
  retry: () => void;
  addReport: (report: Omit<LocalReport, 'id' | 'submittedAt'>) => LocalReport;
  removeReport: (id: string) => void;
}

export const SightingsContext = createContext<SightingsContextValue | null>(null);

export function useSightings(): SightingsContextValue {
  const context = useContext(SightingsContext);
  if (context === null) {
    throw new Error('useSightings must be used inside a SightingsProvider');
  }
  return context;
}
