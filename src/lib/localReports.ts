/**
 * Storage for sightings reported through the form.
 *
 * WHY LOCALSTORAGE AND NOT A DATABASE
 * -----------------------------------
 * The Elanco API is read-only: `POST /data/tick-sightings` returns 405 Method
 * Not Allowed. The brief hints that reporting "will need your own database",
 * but this submission is scoped to the frontend, so there is no server to write
 * to. Rather than fake a successful submission against an endpoint that cannot
 * accept it, reports are persisted in the browser and merged into the same
 * dataset as the API records — so a report really does appear on the map, in the
 * timeline and in the charts, and it survives a page reload.
 *
 * The seam is deliberately narrow. This module is the only thing that knows
 * where reports live; swapping it for a `fetch` against a real backend means
 * reimplementing these four functions and changing nothing else.
 *
 * Limits of the approach, stated plainly in the UI and the README: reports are
 * visible only in the browser that made them, and they are lost if the user
 * clears site data.
 */

import type { LocalReport } from '../types/sighting';

const STORAGE_KEY = 'ticktrack.reports.v1';

/**
 * localStorage throws in Safari private browsing and when a site is configured
 * to block storage, so every access is guarded. A user who cannot store reports
 * should still get a working map, not a blank screen.
 */
function readStorage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function isLocalReport(value: unknown): value is LocalReport {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.date === 'string' &&
    typeof record.time === 'string' &&
    typeof record.location === 'string' &&
    typeof record.species === 'string'
  );
}

export function loadReports(): LocalReport[] {
  const stored = readStorage();
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    // Filter rather than throw: one corrupt entry should not discard the rest.
    return parsed.filter(isLocalReport).map((report) => ({
      ...report,
      latinName: typeof report.latinName === 'string' ? report.latinName : '',
    }));
  } catch {
    return [];
  }
}

export class StorageFullError extends Error {
  constructor() {
    super(
      'There is not enough space left in this browser to save the report. Removing the photograph usually resolves it, as images take up by far the most room.',
    );
    this.name = 'StorageFullError';
  }
}

function writeReports(reports: readonly LocalReport[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch (error) {
    // A quota error is the one failure the user can actually act on, so it gets
    // its own type and its own message in the form.
    if (
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    ) {
      throw new StorageFullError();
    }
    throw new Error('This browser would not let the report be saved.');
  }
}

/**
 * Prefix marks a record as locally reported, which the UI uses to badge it and
 * to let the user delete it. `crypto.randomUUID` needs a secure context; the
 * fallback keeps the form working when the dev server is served over plain HTTP
 * on a LAN address.
 */
function newId(): string {
  const unique =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `local-${unique}`;
}

export function saveReport(input: Omit<LocalReport, 'id' | 'submittedAt'>): LocalReport {
  const report: LocalReport = {
    ...input,
    id: newId(),
    submittedAt: new Date().toISOString(),
  };
  writeReports([...loadReports(), report]);
  return report;
}

export function deleteReport(id: string): void {
  writeReports(loadReports().filter((report) => report.id !== id));
}

export function clearReports(): void {
  writeReports([]);
}

export function isLocalId(id: string): boolean {
  return id.startsWith('local-');
}
