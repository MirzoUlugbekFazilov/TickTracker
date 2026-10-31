/**
 * Client for the Elanco Tick Sightings API.
 *
 * Endpoints discovered on the documented host (`https://dev-task.elancoapps.com`),
 * all under the `/data` prefix and all read-only:
 *
 *   GET /data                            -> { message }
 *   GET /data/health                     -> { status: "UP" }
 *   GET /data/stats                      -> { api_version, total_sightings }
 *   GET /data/tick-sightings             -> RawSighting[]   (1,000 records)
 *   GET /data/tick-sightings/{id}        -> RawSighting
 *   GET /data/tick-sightings/city/{city} -> RawSighting[]
 *   GET /data/tick-sightings/species/{s} -> RawSighting[]
 *
 * Notable behaviours this client has to handle:
 *
 *  - The API is rate limited and answers with a plain-text/HTML body rather
 *    than JSON when the limit is hit, so a bare `response.json()` would throw a
 *    confusing `SyntaxError` instead of a usable message. We detect 429 and
 *    surface a specific, retryable error.
 *  - `POST` returns 405: the API cannot accept new sightings. That is why the
 *    report form writes to local storage instead (see `localReports.ts`).
 *  - CORS is open and reflects the request origin, so the browser can call it
 *    directly with no proxy.
 *
 * The whole dataset is 1,000 records / ~140 KB, so the app fetches it once and
 * does all filtering client-side. That is both faster for the user (filters feel
 * instant) and kinder to a rate-limited API than a request per filter change.
 * The city and species endpoints are therefore not needed for the map; one is
 * wired into the seasonal chart to demonstrate server-side filtering.
 */

import type { ApiStats, RawSighting } from '../types/sighting';

const DEFAULT_BASE_URL = 'https://dev-task.elancoapps.com/data';

/** Base URL, overridable via `VITE_ELANCO_API_BASE_URL` for a mock or proxy. */
export const API_BASE_URL: string =
  import.meta.env.VITE_ELANCO_API_BASE_URL?.replace(/\/+$/, '') || DEFAULT_BASE_URL;

/** Error kinds the UI needs to tell apart to show the right recovery message. */
export type ApiErrorKind = 'network' | 'rate-limit' | 'not-found' | 'server' | 'malformed';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | undefined;
  /** True when retrying the same request could plausibly succeed. */
  readonly retryable: boolean;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.retryable = kind === 'network' || kind === 'rate-limit' || kind === 'server';
  }
}

const REQUEST_TIMEOUT_MS = 20_000;

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  // Abort on timeout as well as on caller cancellation, so a hung connection
  // surfaces as a retryable error rather than an infinite loading state.
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  const composedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: composedSignal,
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    // A caller-initiated abort is not an error condition — let it propagate so
    // React can discard the result without rendering a failure state.
    if (signal?.aborted) throw error;
    clearTimeout(timeout);
    throw new ApiError(
      'network',
      'Could not reach the tick sightings service. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) {
    throw new ApiError(
      'rate-limit',
      'The sightings service is rate limited and has temporarily stopped responding. Wait about a minute, then try again.',
      429,
    );
  }

  if (response.status === 404) {
    throw new ApiError('not-found', 'That record could not be found.', 404);
  }

  if (!response.ok) {
    throw new ApiError(
      'server',
      `The sightings service responded with an error (HTTP ${response.status}).`,
      response.status,
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(
      'malformed',
      'The sightings service returned a response this app could not read.',
      response.status,
    );
  }
}

/** Narrows an unknown value to a RawSighting, discarding anything malformed. */
function isRawSighting(value: unknown): value is RawSighting {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.date === 'string' &&
    typeof record.location === 'string' &&
    typeof record.species === 'string' &&
    typeof record.latinName === 'string'
  );
}

/**
 * Validates the payload rather than trusting the cast. A single malformed row
 * would otherwise produce `NaN` coordinates and a marker at the top-left corner
 * of the map, which is a much harder bug to trace than a dropped row.
 */
function parseSightings(payload: unknown): RawSighting[] {
  if (!Array.isArray(payload)) {
    throw new ApiError('malformed', 'Expected a list of sightings from the service.');
  }
  const valid = payload.filter(isRawSighting);
  if (valid.length === 0 && payload.length > 0) {
    throw new ApiError('malformed', 'No readable sightings in the service response.');
  }
  return valid;
}

export async function fetchAllSightings(signal?: AbortSignal): Promise<RawSighting[]> {
  return parseSightings(await request<unknown>('/tick-sightings', signal));
}

export async function fetchSightingsByCity(
  city: string,
  signal?: AbortSignal,
): Promise<RawSighting[]> {
  return parseSightings(
    await request<unknown>(`/tick-sightings/city/${encodeURIComponent(city)}`, signal),
  );
}

export async function fetchSightingsBySpecies(
  species: string,
  signal?: AbortSignal,
): Promise<RawSighting[]> {
  return parseSightings(
    await request<unknown>(`/tick-sightings/species/${encodeURIComponent(species)}`, signal),
  );
}

export async function fetchSightingById(
  id: string,
  signal?: AbortSignal,
): Promise<RawSighting> {
  const payload = await request<unknown>(`/tick-sightings/${encodeURIComponent(id)}`, signal);
  if (!isRawSighting(payload)) {
    throw new ApiError('malformed', 'That sighting record could not be read.');
  }
  return payload;
}

export async function fetchStats(signal?: AbortSignal): Promise<ApiStats> {
  return request<ApiStats>('/stats', signal);
}
