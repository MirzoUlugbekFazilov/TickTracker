/**
 * The Postgres connection pool.
 *
 * One pool for the process. Creating a client per request is the classic way
 * to exhaust a database's connection limit under any real load — the pool
 * exists precisely to keep a small number of connections open and hand them
 * out.
 */

import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

/**
 * `pg` returns DATE and TIMESTAMP columns as JavaScript Dates in the server's
 * local timezone. For `observed_at` that is exactly wrong: the column is a
 * deliberately naive local timestamp (the upstream API sends no timezone), and
 * letting the driver reinterpret it would shift every value by the server's
 * UTC offset.
 *
 * Parsing it as a plain string instead keeps it opaque all the way to the
 * client, which formats it. 1114 is TIMESTAMP WITHOUT TIME ZONE.
 */
pg.types.setTypeParser(1114, (value: string) => value);

/**
 * Managed Postgres (Supabase, Neon, RDS, …) requires TLS; a local cluster
 * started by Homebrew or Docker does not have it enabled at all, and asking
 * for SSL there fails the handshake outright. So SSL is decided from the host
 * rather than hard-coded either way, which lets the identical codebase run
 * against a laptop and against the hosted database with only DATABASE_URL
 * changing.
 *
 * `rejectUnauthorized: false` is deliberate and limited: Supabase's pooler
 * presents a certificate signed by its own CA, which Node does not ship in its
 * trust store. The connection is still encrypted — this disables chain
 * verification, not TLS. The production-grade fix is to download Supabase's CA
 * certificate and pass it as `ca`, and that is noted in the README rather than
 * quietly skipped.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '']);

function sslConfig(): false | { rejectUnauthorized: boolean } {
  if (process.env.DATABASE_SSL === 'false') return false;
  if (process.env.DATABASE_SSL === 'true') return { rejectUnauthorized: false };

  // Parse rather than string-match. A connection string without credentials
  // (`postgresql://localhost:5432/db`) has no `@` at all, so looking for
  // "@localhost" misses it and then asks a local cluster — which has TLS
  // disabled — for SSL, failing the handshake.
  let hostname: string;
  try {
    hostname = new URL(config.DATABASE_URL).hostname;
  } catch {
    // Unparseable (e.g. a Unix-socket form). Assume local and skip TLS;
    // DATABASE_SSL is available to override.
    return false;
  }

  return LOCAL_HOSTS.has(hostname) ? false : { rejectUnauthorized: false };
}

/**
 * Pool size, which has to differ between a long-running server and a Function.
 *
 * A single long-running process owns exactly one pool, so 10 connections is a
 * sensible ceiling for a read-heavy API.
 *
 * Serverless breaks that assumption completely. Vercel's Fluid Compute runs
 * SEVERAL instances concurrently, each importing this module and each building
 * its own pool — so the real connection count is `max x instances`, not `max`.
 * With `max: 10` against Supabase's session pooler (15 clients on the free
 * tier) two warm instances are enough to exhaust the database, and every
 * request that needs more than one connection starts failing:
 *
 *   (EMAXCONNSESSION) max clients reached in session mode
 *                     - max clients are limited to pool_size: 15
 *
 * It surfaced first on `/api/sightings`, which issues five queries in parallel
 * (rows, count, and one per facet dimension), while `/api/health` kept
 * returning 200 because a single `SELECT 1` can nearly always get a slot. A
 * green health check beside a failing endpoint is the signature of connection
 * exhaustion rather than an outage.
 *
 * Two connections per instance leaves headroom for several instances. Requests
 * needing more are queued by pg-pool rather than refused — slightly slower
 * under burst, which is the right trade against failing outright.
 */
function poolMax(): number {
  const override = Number(process.env.DATABASE_POOL_MAX);
  if (Number.isFinite(override) && override > 0) return override;
  return process.env.VERCEL ? 2 : 10;
}

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: sslConfig(),
  max: poolMax(),
  // Short on serverless: an idle instance should hand its connections back
  // quickly so other instances can use them, rather than hoarding them for
  // the 30 seconds a long-running server can afford.
  idleTimeoutMillis: process.env.VERCEL ? 10_000 : 30_000,
  // Fail fast rather than hanging a request if the database is unreachable.
  // A little more generous than a LAN default because a hosted database is a
  // network hop away, and this also covers time spent queued for a slot.
  connectionTimeoutMillis: 10_000,
});

/**
 * An idle client erroring is not tied to any request, so without this handler
 * it would reach `process.on('uncaughtException')` and kill the server. Log it
 * and let the pool replace the client.
 */
pool.on('error', (error) => {
  console.error('[db] idle client error:', error.message);
});

/** Thin wrapper so call sites read as `query<Row>(sql, params)`. */
export async function query<Row extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<pg.QueryResult<Row>> {
  return pool.query<Row>(text, params as unknown[]);
}

/**
 * Runs `fn` inside a transaction, committing on success and rolling back on
 * any throw. The client is always released, including when the rollback
 * itself fails — a leaked client is far worse than a failed rollback.
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[db] rollback failed:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Used by the health endpoint and by startup to confirm connectivity. */
export async function checkConnection(): Promise<void> {
  await pool.query('SELECT 1');
}

export async function closePool(): Promise<void> {
  await pool.end();
}
