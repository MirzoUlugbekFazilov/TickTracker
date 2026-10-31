/**
 * Migration runner.
 *
 * Plain `.sql` files applied in filename order, with a `schema_migrations`
 * table recording what has run. No migration framework, for one reason: this
 * project's whole schema is one file, and a dependency that adds a CLI, a
 * config file and a DSL to run `psql -f` is a worse trade than forty lines.
 *
 * The properties that actually matter are still here:
 *
 *   - Idempotent. Already-applied files are skipped, so running it twice is
 *     safe and so is running it on a fresh database.
 *   - Atomic per file. Each migration runs inside a transaction together with
 *     its bookkeeping insert, so a failure half way through leaves no record
 *     claiming it succeeded.
 *   - Ordered and verified. Files are sorted by name, and a checksum catches
 *     an already-applied migration being edited after the fact — which is the
 *     single most common way a team's databases silently diverge.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, pool } from './pool.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

function checksum(contents: string): string {
  return createHash('sha256').update(contents).digest('hex').slice(0, 16);
}

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      checksum    TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const { rows: applied } = await pool.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM schema_migrations',
  );
  const appliedByName = new Map(applied.map((row) => [row.name, row.checksum]));

  let ran = 0;

  for (const file of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const hash = checksum(sql);
    const previous = appliedByName.get(file);

    if (previous !== undefined) {
      if (previous !== hash) {
        // Loud, not silent. Editing an applied migration means this database
        // and any other are now running different schemas from the same
        // filename, and no later migration can be trusted to apply cleanly.
        throw new Error(
          `Migration "${file}" has changed since it was applied ` +
            `(recorded ${previous}, now ${hash}). Add a new migration instead ` +
            `of editing one that has already run.`,
        );
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
        [file, hash],
      );
      await client.query('COMMIT');
      console.log(`[migrate] applied ${file}`);
      ran += 1;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error(
        `Migration "${file}" failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      client.release();
    }
  }

  console.log(
    ran === 0
      ? '[migrate] schema already up to date'
      : `[migrate] applied ${ran} migration${ran === 1 ? '' : 's'}`,
  );
}

// Allow `npm run migrate` to execute this file directly, while still letting
// the server import `migrate()` and run it on boot.
const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  migrate()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error('[migrate] failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
