/**
 * `/api/meta`, `/api/health` and the admin ingest trigger.
 *
 * `/api/meta` exists so the frontend hard-codes nothing. Cities, species,
 * severity levels, the current breakpoints, the dataset's date range and the
 * recency cutoff all come from the server, which means the UI stays correct
 * when the data changes underneath it instead of drifting out of sync with a
 * duplicated constant.
 */

import { Router } from 'express';
import { query } from '../db/pool.js';
import {
  RECENT_WINDOW_DAYS,
  getDatasetMeta,
  getLastIngestRun,
} from '../db/sightingsRepo.js';
import { CITIES } from '../domain/cities.js';
import { SPECIES } from '../domain/species.js';
import { checkUpstreamHealth } from '../ingest/elancoClient.js';
import { isDatasetEmpty, runIngest } from '../ingest/ingestService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { SEVERITY_LEVELS, type MetaResponse } from '../types.js';
import { checkConnection } from '../db/pool.js';

export const metaRouter = Router();

metaRouter.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    const [meta, lastIngest, totals] = await Promise.all([
      getDatasetMeta(),
      getLastIngestRun(),
      query<{ count: string }>('SELECT count(*)::text AS count FROM sightings'),
    ]);

    const body: MetaResponse = {
      cities: CITIES.map((city) => ({
        name: city.name,
        lat: city.lat,
        lng: city.lng,
        region: city.region,
      })),
      species: SPECIES.map((species) => ({
        name: species.name,
        latinName: species.latinName,
        genus: species.genus,
        vectorWeight: species.vectorWeight,
        colorSlot: species.colorSlot,
      })),
      severityLevels: SEVERITY_LEVELS,
      severityBreakpoints: meta.breakpoints,
      dateRange: { earliest: meta.earliestObserved, latest: meta.latestObserved },
      recentWindowDays: RECENT_WINDOW_DAYS,
      recentSince: meta.recentSince,
      totalSightings: Number(totals.rows[0]?.count ?? 0),
      lastIngest,
    };

    res.json(body);
  }),
);

/**
 * Health check.
 *
 * Reports the database and the upstream API separately, because they fail
 * independently and the right response differs: without the database this
 * service is down, whereas without the upstream API it still serves
 * everything already ingested. Only the database affects the status code, so
 * an upstream outage does not cause a load balancer to pull a working
 * instance out of rotation.
 */
metaRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const [database, upstream] = await Promise.allSettled([
      checkConnection(),
      checkUpstreamHealth(),
    ]);

    const databaseOk = database.status === 'fulfilled';
    const upstreamOk = upstream.status === 'fulfilled' && upstream.value === true;

    res.status(databaseOk ? 200 : 503).json({
      status: databaseOk ? 'ok' : 'degraded',
      checks: {
        database: databaseOk ? 'up' : 'down',
        elancoApi: upstreamOk ? 'up' : 'unreachable',
      },
      uptimeSeconds: Math.round(process.uptime()),
    });
  }),
);

/**
 * Manually triggers an ingest.
 *
 * Deliberately not exposed to the browser UI. In production this would sit
 * behind authentication and, better, be replaced by a scheduled job — a
 * long-running import triggered by an unauthenticated HTTP request is an
 * obvious way to overload both this service and the upstream API. It is here
 * because a reviewer needs a way to re-run the pipeline on demand, and the
 * README says exactly that.
 */
metaRouter.post(
  '/admin/ingest',
  asyncHandler(async (_req, res) => {
    const result = await runIngest();
    res.json({ data: result });
  }),
);

metaRouter.get(
  '/admin/ingest/status',
  asyncHandler(async (_req, res) => {
    const [lastRun, empty] = await Promise.all([getLastIngestRun(), isDatasetEmpty()]);
    res.json({ data: { lastRun, datasetEmpty: empty } });
  }),
);
