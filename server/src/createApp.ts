/**
 * Express application assembly.
 *
 * Kept separate from `index.ts` (which owns the listener and lifecycle) so the
 * app can be constructed without binding a port — which is what makes it
 * testable with supertest, and what lets the ingest script import from the
 * same codebase without starting a server.
 *
 * NAMED createApp.ts, NOT app.ts, DELIBERATELY. Vercel resolves a backend
 * entry point by searching `app.*`, `index.*`, `server.*`, `src/app.*`,
 * `src/index.*`, `src/server.*` in that order, and requires the match to have
 * a default export that is a function or a server. As `src/app.ts` this file
 * won the search, exported only the `createApp` factory, and every request
 * failed with "Invalid export found in module ... The default export must be a
 * function or server." Renaming it lets `src/index.ts` win, which exports the
 * constructed app as required.
 *
 * Middleware order matters and is deliberate:
 *   1. CORS            — must run before anything that can reject a request,
 *                        or the browser sees a CORS error instead of the real
 *                        status and the actual problem is invisible.
 *   2. body parsing    — with an explicit size limit.
 *   3. request logging — after parsing so it can report the outcome.
 *   4. routes
 *   5. 404             — only reached when nothing matched.
 *   6. error handler   — last; Express identifies it by its four arguments.
 */

import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { sightingsRouter } from './routes/sightings.js';
import { insightsRouter } from './routes/insights.js';
import { metaRouter } from './routes/meta.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // Behind a proxy (Railway, Fly, Heroku, nginx) this makes req.ip and
  // req.protocol reflect the client rather than the proxy.
  app.set('trust proxy', 1);
  // Advertising the framework and version tells an attacker which CVEs to try.
  app.disable('x-powered-by');

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header: same-origin, curl, or a server-to-server call.
        // Not a browser cross-origin request, so there is nothing to block.
        if (!origin) return callback(null, true);
        if (config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
      },
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      maxAge: 86_400,
    }),
  );

  // The limit has to clear a downscaled photograph encoded as base64, which is
  // ~33% larger than the bytes it represents. Exceeding it produces a 413 with
  // an actionable message rather than a connection reset — see errorHandler.
  app.use(express.json({ limit: config.MAX_BODY_SIZE }));

  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
      // Health checks are excluded: on any platform with liveness probes they
      // would otherwise be the overwhelming majority of the log.
      if (req.path === '/api/health') return;
      console.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`,
      );
    });
    next();
  });

  app.use('/api/sightings', sightingsRouter);
  app.use('/api/insights', insightsRouter);
  app.use('/api', metaRouter);

  // A friendly root so hitting the bare host is not a confusing 404.
  app.get('/', (_req, res) => {
    res.json({
      name: 'TickTrack UK API',
      documentation: 'See README.md for the full endpoint reference.',
      endpoints: [
        'GET  /api/health',
        'GET  /api/meta',
        'GET  /api/sightings',
        'GET  /api/sightings/:id',
        'GET  /api/sightings/:id/image',
        'POST /api/sightings',
        'DELETE /api/sightings/:id',
        'GET  /api/insights/regions',
        'GET  /api/insights/trends',
        'GET  /api/insights/species',
        'GET  /api/insights/seasonal',
        'GET  /api/insights/summary',
        'POST /api/admin/ingest',
      ],
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
