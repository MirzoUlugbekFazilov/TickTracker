/**
 * `npm run db:status` — reports exactly what is in the target database.
 *
 * Written so that "is the Supabase project clean and correctly set up?" has a
 * single, checkable answer rather than a tour of the dashboard. It reports:
 *
 *   - which host it is actually talking to (masked), so there is no doubt
 *     whether a command hit Supabase or a local cluster
 *   - the server version, confirming it really is PostgreSQL
 *   - every table in `public`, with row counts — including any that are NOT
 *     ours, which is what "clean" actually means
 *   - RLS status per table, since on Supabase an un-protected public table is
 *     served to the internet
 *   - migration and ingest history
 */

import { closePool, query } from './pool.js';
import { config } from '../config.js';

/** Our tables, so anything else in `public` can be flagged as unexpected. */
const EXPECTED_TABLES = [
  'cities',
  'dataset_meta',
  'ingest_runs',
  'schema_migrations',
  'sightings',
  'species',
];

function describeTarget(): string {
  try {
    const url = new URL(config.DATABASE_URL);
    const host = url.hostname;
    const database = url.pathname.replace(/^\//, '') || '(default)';
    const kind = host.includes('supabase')
      ? 'Supabase'
      : host === 'localhost' || host === '127.0.0.1'
        ? 'local PostgreSQL'
        : 'remote PostgreSQL';
    // Username is shown because on Supabase it encodes the project ref, which
    // is the only way to confirm *which* project this is. The password is
    // never read, let alone printed.
    return `${kind} — ${url.username || '(no user)'}@${host}:${url.port || '5432'}/${database}`;
  } catch {
    return '(could not parse DATABASE_URL)';
  }
}

async function main(): Promise<void> {
  console.log('\n  TickTracker database status');
  console.log('  ' + '-'.repeat(60));
  console.log(`  Target   : ${describeTarget()}`);

  const version = await query<{ version: string }>('SELECT version()');
  const raw = version.rows[0]?.version ?? 'unknown';
  console.log(`  Engine   : ${raw.split(' on ')[0]}`);

  /* ------------------------------------------------------------- tables */

  const tables = await query<{ table_name: string; rls: boolean }>(
    `SELECT c.relname AS table_name, c.relrowsecurity AS rls
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname`,
  );

  console.log('\n  Tables in public schema');
  console.log('  ' + '-'.repeat(60));

  if (tables.rows.length === 0) {
    console.log('  (none — run `npm run migrate`)');
  }

  const unexpected: string[] = [];

  for (const row of tables.rows) {
    // Counted per table rather than from pg_stat, which is only an estimate
    // and reads as 0 on a freshly loaded table until autovacuum runs.
    const count = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "${row.table_name}"`,
    );
    const rows = Number(count.rows[0]?.n ?? 0);
    const known = EXPECTED_TABLES.includes(row.table_name);
    if (!known) unexpected.push(row.table_name);

    console.log(
      `  ${known ? ' ' : '!'} ${row.table_name.padEnd(20)} ` +
        `${String(rows).padStart(6)} rows   RLS ${row.rls ? 'on ' : 'OFF'}` +
        `${known ? '' : '   <- not created by this app'}`,
    );
  }

  /* --------------------------------------------------------- migrations */

  const migrations = await query<{ name: string; applied_at: Date }>(
    `SELECT name, applied_at FROM schema_migrations ORDER BY name`,
  ).catch(() => ({ rows: [] as Array<{ name: string; applied_at: Date }> }));

  console.log('\n  Migrations applied');
  console.log('  ' + '-'.repeat(60));
  if (migrations.rows.length === 0) {
    console.log('  (none)');
  } else {
    for (const row of migrations.rows) {
      console.log(`    ${row.name.padEnd(24)} ${row.applied_at.toISOString()}`);
    }
  }

  /* ------------------------------------------------------------- ingest */

  const runs = await query<{
    id: number;
    status: string;
    fetched: number;
    inserted: number;
    updated: number;
    rejected: number;
    started_at: Date;
  }>(
    `SELECT id, status, fetched, inserted, updated, rejected, started_at
       FROM ingest_runs ORDER BY started_at DESC LIMIT 5`,
  ).catch(() => ({ rows: [] as never[] }));

  console.log('\n  Recent ingest runs');
  console.log('  ' + '-'.repeat(60));
  if (runs.rows.length === 0) {
    console.log('  (none — run `npm run ingest`)');
  } else {
    for (const run of runs.rows) {
      console.log(
        `    #${String(run.id).padEnd(4)} ${run.status.padEnd(8)} ` +
          `fetched ${String(run.fetched).padStart(5)}  ` +
          `inserted ${String(run.inserted).padStart(5)}  ` +
          `updated ${String(run.updated).padStart(5)}  ` +
          `rejected ${String(run.rejected).padStart(4)}`,
      );
    }
  }

  /* ------------------------------------------------------------ verdict */

  console.log('\n  Verdict');
  console.log('  ' + '-'.repeat(60));

  const problems: string[] = [];
  if (unexpected.length > 0) {
    problems.push(`${unexpected.length} unexpected table(s): ${unexpected.join(', ')}`);
  }
  const unprotected = tables.rows.filter((row) => !row.rls).map((row) => row.table_name);
  if (unprotected.length > 0 && config.DATABASE_URL.includes('supabase')) {
    problems.push(
      `RLS is OFF on ${unprotected.join(', ')} — on Supabase these are exposed via PostgREST`,
    );
  }
  if (tables.rows.length === 0) problems.push('no schema — run `npm run migrate`');

  if (problems.length === 0) {
    console.log('  Clean. Schema matches this application and nothing else is present.');
  } else {
    for (const problem of problems) console.log(`  ! ${problem}`);
  }
  console.log('');
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    console.error(
      '\n  Could not read the database:',
      error instanceof Error ? error.message : error,
    );
    console.error('  Check DATABASE_URL in server/.env\n');
    await closePool().catch(() => undefined);
    process.exit(1);
  });
