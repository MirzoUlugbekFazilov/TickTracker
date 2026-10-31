/**
 * `npm run db:reset` — drops this application's tables and re-migrates.
 *
 * For getting a database back to a known-clean state: a half-applied
 * migration, a schema edited by hand, or a Supabase project you want to be
 * certain contains nothing but this app.
 *
 * SAFETY
 *
 * Two deliberate guards, because this is the one destructive command here:
 *
 *  1. It drops only the six tables this application creates, by name. It never
 *     issues `DROP SCHEMA public CASCADE` — on Supabase that would take out
 *     auth, storage and realtime along with it, which is an unrecoverable
 *     mistake on a project that holds anything else.
 *
 *  2. It requires explicit confirmation. Running it with no argument prints
 *     what it would do and exits without touching anything, so a stray
 *     invocation in the wrong terminal cannot destroy data.
 *
 *     npm run db:reset -- --yes
 */

import { closePool, pool, query } from './pool.js';
import { config } from './../config.js';
import { migrate } from './migrate.js';

/**
 * Dropped child-first so foreign keys do not block the drop. `CASCADE` is
 * deliberately not used: it would silently remove dependent objects outside
 * this list, which is exactly the surprise this script is trying to avoid.
 */
const TABLES_IN_DROP_ORDER = [
  'sightings', // references cities
  'ingest_runs',
  'dataset_meta',
  'species',
  'cities',
  'schema_migrations',
];

function describeTarget(): string {
  try {
    const url = new URL(config.DATABASE_URL);
    return `${url.username || '(no user)'}@${url.hostname}:${url.port || '5432'}${url.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

async function main(): Promise<void> {
  const confirmed = process.argv.includes('--yes');
  const target = describeTarget();

  console.log('\n  Database reset');
  console.log('  ' + '-'.repeat(60));
  console.log(`  Target : ${target}`);
  console.log(`  Drops  : ${TABLES_IN_DROP_ORDER.join(', ')}`);

  if (!confirmed) {
    console.log('\n  Nothing has been changed.');
    console.log('  Re-run with --yes to proceed:\n');
    console.log('      npm run db:reset -- --yes\n');
    return;
  }

  // Row counts first, so the log records what was actually destroyed rather
  // than just that something was.
  for (const table of TABLES_IN_DROP_ORDER) {
    const result = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "${table}"`,
    ).catch(() => null);
    if (result) {
      console.log(`  dropping ${table} (${result.rows[0]?.n ?? '?'} rows)`);
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const table of TABLES_IN_DROP_ORDER) {
      await client.query(`DROP TABLE IF EXISTS "${table}"`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  console.log('\n  Dropped. Re-applying migrations...\n');
  await migrate();
  console.log('\n  Done. Run `npm run ingest` to repopulate.\n');
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    console.error('\n  Reset failed:', error instanceof Error ? error.message : error, '\n');
    await closePool().catch(() => undefined);
    process.exit(1);
  });
