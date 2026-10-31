/**
 * Client for the TickTrack API.
 *
 * This used to call the Elanco service directly and derive coordinates,
 * severity and recency in the browser. All of that now happens server-side
 * during ingest, so this file is a thin, typed transport: build a URL,
 * validate the response shape, turn failures into something the UI can act on.
 *
 * ERROR HANDLING
 * The API returns a consistent `{ error: { code, message, details } }` body on
 * every failure, so this parses that envelope and surfaces `message` directly.
 * Those messages are written for end users server-side, which is why the UI can
 * show them verbatim instead of inventing its own.
 */

import type {
  Filters,
  MetaResponse,
  NewSightingPayload,
  RegionInsight,
  SeasonalPoint,
  Sighting,
  SightingsResponse,
  SpeciesInsight,
  SummaryInsight,
  TrendPoint,
} from '../types/sighting';

/**
 * Base URL. Defaults to a relative `/api`, which works in production behind a
 * single origin and in development via the Vite proxy — so no CORS in the
 * common case and no hard-coded localhost port in the bundle.
 */
export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL || '/api').replace(
  /\/+$/,
  '',
);

export type ApiErrorKind =
  | 'network'
  | 'validation'
  | 'not-found'
  | 'rate-limit'
  | 'server'
  | 'malformed';

export interface FieldIssue {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | undefined;
  readonly code: string | undefined;
  /** Field-level problems from a validation failure. */
  readonly details: FieldIssue[] | undefined;
  readonly retryable: boolean;

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: {
      status?: number;
      code?: string;
      details?: FieldIssue[];
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.retryable = options.retryable ?? (kind === 'network' || kind === 'server');
  }
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 400 || status === 413) return 'validation';
  if (status === 404) return 'not-found';
  if (status === 429) return 'rate-limit';
  return 'server';
}

const REQUEST_TIMEOUT_MS = 25_000;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  // Abort on timeout as well as on caller cancellation, so a hung connection
  // surfaces as a retryable error rather than an endless loading state.
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    // A caller-initiated abort is not a failure — let it propagate so React
    // discards the result instead of rendering an error.
    if (init.signal?.aborted) throw error;
    throw new ApiError(
      'network',
      'Could not reach the TickTrack service. Check that the API is running and try again.',
    );
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw new ApiError('server', `The service returned HTTP ${response.status}.`, {
        status: response.status,
      });
    }
    throw new ApiError('malformed', 'The service returned a response this app could not read.');
  }

  if (!response.ok) {
    const envelope = payload as {
      error?: { code?: string; message?: string; details?: FieldIssue[] };
    };
    const error = envelope.error;
    throw new ApiError(
      kindForStatus(response.status),
      error?.message ?? `The service returned HTTP ${response.status}.`,
      {
        status: response.status,
        ...(error?.code ? { code: error.code } : {}),
        ...(error?.details ? { details: error.details } : {}),
        retryable: response.headers.get('X-Retryable') === 'true',
      },
    );
  }

  return payload as T;
}

/* --------------------------------------------------------- query building */

/**
 * Serialises filter state into query parameters.
 *
 * Empty values are omitted entirely rather than sent as blanks, so the server
 * sees "no constraint" instead of having to treat an empty string as one.
 */
export function filtersToQuery(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.dateFrom) params.set('from', filters.dateFrom);
  if (filters.dateTo) params.set('to', filters.dateTo);
  if (filters.city) params.set('city', filters.city);
  if (filters.species.size > 0) params.set('species', [...filters.species].join(','));
  if (filters.severities.size > 0) params.set('severity', [...filters.severities].join(','));
  if (filters.recentOnly) params.set('recentOnly', 'true');
  // "Exclude my reports" is expressed as "only upstream records", which is a
  // filter the API already supports rather than a special case.
  if (!filters.includeLocal) params.set('source', 'elanco');

  return params;
}

/* ----------------------------------------------------------- endpoints */

export async function fetchMeta(signal?: AbortSignal): Promise<MetaResponse> {
  return request<MetaResponse>('/meta', signal ? { signal } : {});
}

export async function fetchSightings(
  filters: Filters,
  signal?: AbortSignal,
): Promise<SightingsResponse> {
  const params = filtersToQuery(filters);
  // The map needs every matching point, not a page of them. 5000 is the
  // server's ceiling and comfortably exceeds the dataset; pagination is
  // available via limit/offset for any future list view.
  params.set('limit', '5000');
  return request<SightingsResponse>(`/sightings?${params}`, signal ? { signal } : {});
}

export async function fetchSighting(id: string, signal?: AbortSignal): Promise<Sighting> {
  const body = await request<{ data: Sighting }>(
    `/sightings/${encodeURIComponent(id)}`,
    signal ? { signal } : {},
  );
  return body.data;
}

export async function createSighting(payload: NewSightingPayload): Promise<Sighting> {
  const body = await request<{ data: Sighting }>('/sightings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function deleteSighting(id: string): Promise<void> {
  await request<void>(`/sightings/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** URL for an attached photograph, served separately from the JSON payload. */
export function sightingImageUrl(id: string): string {
  return `${API_BASE_URL}/sightings/${encodeURIComponent(id)}/image`;
}

/* ------------------------------------------------------------ insights */

export async function fetchRegionInsights(
  filters: Filters,
  signal?: AbortSignal,
): Promise<RegionInsight[]> {
  const body = await request<{ data: RegionInsight[] }>(
    `/insights/regions?${filtersToQuery(filters)}`,
    signal ? { signal } : {},
  );
  return body.data;
}

export async function fetchTrends(
  filters: Filters,
  interval: 'week' | 'month' | 'year',
  signal?: AbortSignal,
): Promise<TrendPoint[]> {
  const params = filtersToQuery(filters);
  params.set('interval', interval);
  const body = await request<{ data: TrendPoint[] }>(
    `/insights/trends?${params}`,
    signal ? { signal } : {},
  );
  return body.data;
}

export async function fetchSpeciesInsights(
  filters: Filters,
  signal?: AbortSignal,
): Promise<SpeciesInsight[]> {
  const body = await request<{ data: SpeciesInsight[] }>(
    `/insights/species?${filtersToQuery(filters)}`,
    signal ? { signal } : {},
  );
  return body.data;
}

export async function fetchSeasonal(
  filters: Filters,
  signal?: AbortSignal,
): Promise<SeasonalPoint[]> {
  const body = await request<{ data: SeasonalPoint[] }>(
    `/insights/seasonal?${filtersToQuery(filters)}`,
    signal ? { signal } : {},
  );
  return body.data;
}

export async function fetchSummary(
  filters: Filters,
  signal?: AbortSignal,
): Promise<SummaryInsight> {
  const body = await request<{ data: SummaryInsight }>(
    `/insights/summary?${filtersToQuery(filters)}`,
    signal ? { signal } : {},
  );
  return body.data;
}
