/**
 * Client for the upstream Elanco Tick Sightings API.
 *
 * Endpoints (all read-only, discovered against the live service):
 *
 *   GET /tick-sightings              -> RawSighting[]  (1,000 records, ~140 KB)
 *   GET /tick-sightings/{id}         -> RawSighting
 *   GET /tick-sightings/city/{city}  -> RawSighting[]
 *   GET /tick-sightings/species/{s}  -> RawSighting[]
 *   GET /stats                       -> { api_version, total_sightings }
 *   GET /health                      -> { status: "UP" }
 *
 * THINGS THIS CLIENT EXISTS TO HANDLE
 *
 *  - The service is rate limited and answers 429 with an HTML/text body, so a
 *    bare `response.json()` throws an opaque SyntaxError instead of something
 *    actionable. 429 is detected before parsing.
 *  - Transient network failures and 5xx responses are retried with exponential
 *    backoff and jitter. Jitter matters: without it, every client that failed
 *    at the same moment retries at the same moment.
 *  - 4xx responses other than 429 are NOT retried. A malformed request will
 *    fail identically next time, and retrying it just multiplies load.
 *  - Every request has a hard timeout, so a hung connection surfaces as a
 *    retryable failure rather than an ingest that never finishes.
 */

import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import type { RawSighting } from '../types.js';

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

export interface ElancoStats {
  api_version: string;
  total_sightings: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with full jitter, capped so a retry never stalls boot. */
function backoffDelay(attempt: number): number {
  const ceiling = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), 5_000);
  return Math.random() * ceiling;
}

async function requestOnce(path: string): Promise<Response> {
  // AbortSignal.timeout gives a clean, self-clearing timeout; a manual
  // setTimeout + clearTimeout pair is easy to leak on the error path.
  return fetch(`${config.ELANCO_API_BASE_URL}${path}`, {
    signal: AbortSignal.timeout(config.ELANCO_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
}

async function request<T>(path: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;

    try {
      response = await requestOnce(path);
    } catch (error) {
      // Network failure or timeout — retryable.
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        const delay = backoffDelay(attempt);
        console.warn(
          `[elanco] ${path} attempt ${attempt} failed (${
            error instanceof Error ? error.message : 'unknown'
          }); retrying in ${Math.round(delay)}ms`,
        );
        await sleep(delay);
        continue;
      }
      throw AppError.upstreamUnavailable(
        'Could not reach the Elanco sightings service. It may be temporarily unavailable.',
        error,
      );
    }

    if (response.status === 429) {
      lastError = new Error('rate limited');
      if (attempt < MAX_ATTEMPTS) {
        // Honour Retry-After when present; the service does not always send
        // one, hence the fallback to our own backoff.
        const retryAfter = Number(response.headers.get('retry-after'));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 10_000)
          : backoffDelay(attempt) + 1_000;
        console.warn(`[elanco] ${path} rate limited; retrying in ${Math.round(delay)}ms`);
        await sleep(delay);
        continue;
      }
      throw AppError.upstreamRateLimited(
        'The Elanco sightings service is rate limiting requests. Try again in a minute.',
      );
    }

    if (response.status >= 500) {
      lastError = new Error(`HTTP ${response.status}`);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw AppError.upstreamUnavailable(
        `The Elanco sightings service returned HTTP ${response.status}.`,
        lastError,
      );
    }

    if (!response.ok) {
      // 4xx other than 429: deterministic, so retrying is pointless.
      throw AppError.upstreamUnavailable(
        `The Elanco sightings service rejected the request (HTTP ${response.status}).`,
      );
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      throw AppError.upstreamMalformed(
        'The Elanco sightings service returned a response that could not be parsed as JSON.',
        error,
      );
    }
  }

  throw AppError.upstreamUnavailable('Exhausted retries contacting the Elanco service.', lastError);
}

/**
 * Structural check on one upstream record.
 *
 * The ingest pipeline needs to tell "this row is unusable" apart from "the
 * whole response is wrong", so this returns a reason rather than a boolean —
 * the reason ends up in the `ingest_runs.rejection_reasons` tally.
 */
export function validateRawSighting(value: unknown): { ok: true; value: RawSighting } | { ok: false; reason: string } {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, reason: 'not an object' };
  }

  const record = value as Record<string, unknown>;

  if (typeof record.id !== 'string' || record.id.trim() === '') {
    return { ok: false, reason: 'missing or empty id' };
  }
  if (typeof record.date !== 'string' || record.date.trim() === '') {
    return { ok: false, reason: 'missing or empty date' };
  }
  if (Number.isNaN(new Date(record.date).getTime())) {
    return { ok: false, reason: 'unparseable date' };
  }
  if (typeof record.location !== 'string' || record.location.trim() === '') {
    return { ok: false, reason: 'missing or empty location' };
  }
  if (typeof record.species !== 'string' || record.species.trim() === '') {
    return { ok: false, reason: 'missing or empty species' };
  }

  return {
    ok: true,
    value: {
      id: record.id.trim(),
      date: record.date.trim(),
      location: record.location.trim(),
      species: record.species.trim(),
      // latinName is the one field we tolerate missing: it is derivable from
      // the species name via our own reference table.
      latinName: typeof record.latinName === 'string' ? record.latinName.trim() : '',
    },
  };
}

export async function fetchAllSightings(): Promise<unknown[]> {
  const payload = await request<unknown>('/tick-sightings');
  if (!Array.isArray(payload)) {
    throw AppError.upstreamMalformed(
      'Expected the Elanco service to return a list of sightings.',
    );
  }
  return payload;
}

export async function fetchStats(): Promise<ElancoStats | null> {
  try {
    return await request<ElancoStats>('/stats');
  } catch {
    // Stats are a nice-to-have reconciliation check, never a reason to fail
    // an ingest that otherwise succeeded.
    return null;
  }
}

/** Healthy status strings the upstream has been observed to return. */
const HEALTHY_STATUSES = new Set(['healthy', 'up', 'ok', 'pass']);

export async function checkUpstreamHealth(): Promise<boolean> {
  try {
    const result = await request<{ status?: string }>('/health');
    // Matched case-insensitively against a set rather than one exact literal:
    // `/data/health` answers "healthy" while the sibling `/api-service/health`
    // answers "UP", and pinning to a single spelling made a working service
    // report as unreachable.
    return (
      typeof result.status === 'string' &&
      HEALTHY_STATUSES.has(result.status.trim().toLowerCase())
    );
  } catch {
    return false;
  }
}
