/**
 * Environment configuration, validated once at startup.
 *
 * Everything the server needs is read and checked here, so a missing or
 * malformed variable fails immediately with a clear message rather than
 * surfacing as `undefined` in a query three layers down at request time.
 */

import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  /**
   * Postgres connection string. No default: a silent fallback to some local
   * database is how you end up ingesting into the wrong place and not noticing.
   */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /** Upstream Elanco API. Overridable for a mock in tests. */
  ELANCO_API_BASE_URL: z
    .string()
    .url()
    .default('https://dev-task.elancoapps.com/data'),

  /** Per-request timeout when calling the upstream API, in milliseconds. */
  ELANCO_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),

  /** Browser origins allowed to call this API. Comma-separated. */
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),

  /**
   * Maximum JSON request body. Reports can carry a downscaled photograph as a
   * base64 data URL, which is ~33% larger than the bytes it encodes, so this
   * has to clear the image limit with room to spare.
   */
  MAX_BODY_SIZE: z.string().default('8mb'),

  /** Largest page the sightings endpoint will return. */
  MAX_PAGE_SIZE: z.coerce.number().int().positive().default(5000),

  /**
   * Run an ingest automatically when the server boots if the database is
   * empty. Convenient for a reviewer cloning the repo; off in production,
   * where ingest should be a scheduled job rather than a startup side effect.
   */
  INGEST_ON_BOOT: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  console.error(
    `\nInvalid environment configuration:\n${issues}\n\n` +
      'Copy .env.example to .env and fill in the values.\n',
  );
  process.exit(1);
}

export const config = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  isProduction: parsed.data.NODE_ENV === 'production',
} as const;

export type Config = typeof config;
