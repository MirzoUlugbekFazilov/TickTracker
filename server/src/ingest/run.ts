/**
 * `npm run ingest` — runs the pipeline once and exits.
 *
 * Separate from the server entrypoint so ingest can be scheduled (cron, a
 * container job, a CI step) without starting an HTTP listener, which is how
 * this would actually be operated in production.
 */

import { closePool } from '../db/pool.js';
import { migrate } from '../db/migrate.js';
import { runIngest } from './ingestService.js';

async function main(): Promise<void> {
  // Migrating first means a fresh clone can go straight to `npm run ingest`
  // without having to remember a separate step.
  await migrate();
  const result = await runIngest();

  if (result.rejected > 0) {
    console.warn('[ingest] rejected records by reason:', result.rejectionReasons);
  }
  console.log('[ingest] severity breakpoints:', result.breakpoints);
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    console.error('[ingest] aborted:', error instanceof Error ? error.message : error);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
