/**
 * Server entrypoint: startup sequence and graceful shutdown.
 *
 * STARTUP ORDER IS DELIBERATE
 *   1. Check the database is reachable. Failing here, loudly, beats starting a
 *      server that returns 503 to every request while looking healthy to a
 *      process manager.
 *   2. Run migrations, so a fresh clone (or a fresh Supabase project) gets its
 *      schema without a separate manual step.
 *   3. Start listening — before ingest, not after. Ingest fetches 1,000
 *      records over the network; blocking the listener on it would mean a
 *      platform health check times out and restarts the container mid-import,
 *      forever.
 *   4. Kick off the first ingest in the background if the dataset is empty.
 */

import { createApp } from './app.js';
import { config } from './config.js';
import { checkConnection, closePool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { isDatasetEmpty, runIngest } from './ingest/ingestService.js';

async function main(): Promise<void> {
  console.log(`[boot] starting in ${config.NODE_ENV} mode`);

  try {
    await checkConnection();
    console.log('[boot] database reachable');
  } catch (error) {
    console.error(
      '[boot] could not connect to the database. Check DATABASE_URL in server/.env.\n' +
        `       ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  await migrate();

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    console.log(`[boot] API listening on http://localhost:${config.PORT}`);
    console.log(`[boot] CORS allows: ${config.corsOrigins.join(', ')}`);
  });

  // Background, not awaited: see the note on startup order above.
  if (config.INGEST_ON_BOOT) {
    void (async () => {
      try {
        if (await isDatasetEmpty()) {
          console.log('[boot] dataset is empty — running first ingest');
          await runIngest();
        } else {
          console.log('[boot] dataset already populated — skipping ingest');
        }
      } catch (error) {
        // A failed first ingest must not take the process down. The API still
        // serves whatever is already stored, /api/health reports the upstream
        // as unreachable, and the ingest can be retried.
        console.error(
          '[boot] initial ingest failed; the API will serve existing data:',
          error instanceof Error ? error.message : error,
        );
      }
    })();
  }

  /**
   * Graceful shutdown.
   *
   * Stop accepting new connections, let in-flight requests finish, then close
   * the pool. Without this, a deploy or a Ctrl-C drops live requests and
   * leaves Postgres to time out the abandoned connections itself.
   */
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received — closing`);

    // Hard limit so a hung request cannot block shutdown indefinitely; most
    // orchestrators send SIGKILL after ~30s anyway.
    const force = setTimeout(() => {
      console.warn('[shutdown] forced after 10s');
      process.exit(1);
    }, 10_000);
    force.unref();

    server.close(() => {
      void closePool()
        .then(() => {
          console.log('[shutdown] clean');
          process.exit(0);
        })
        .catch(() => process.exit(1));
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error('[boot] fatal:', error instanceof Error ? error.stack : error);
  process.exit(1);
});
