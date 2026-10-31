/**
 * `/api/insights` — the aggregate endpoints.
 *
 * Every aggregate is computed by Postgres with GROUP BY and date_trunc rather
 * than by fetching rows into Node and reducing them. That is the whole point
 * of having a database: counting 1,000 rows in JavaScript is fine, counting
 * 10 million is not, and the SQL version does not change when the data grows.
 *
 * All of these accept the same filter parameters as `/api/sightings`, so a
 * chart can always be scoped to exactly what the map is showing.
 */

import { Router } from 'express';
import { z } from 'zod';
import {
  insightsByRegion,
  insightsBySpecies,
  insightsSeasonal,
  insightsSummary,
  insightsTrend,
} from '../db/sightingsRepo.js';
import { AppError } from '../lib/errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { SEVERITY_LEVELS, type SeverityLevel } from '../types.js';

export const insightsRouter = Router();

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.');

const multiValue = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const list = Array.isArray(value) ? value : value.split(',');
    const cleaned = list.map((item) => item.trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : undefined;
  });

const filterSchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  city: z.string().trim().min(1).optional(),
  species: multiValue,
  severity: multiValue,
  source: z.enum(['elanco', 'user']).optional(),
  recentOnly: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((value) => value === 'true'),
});

/** Shared parse + narrow, so each route is three lines of its own logic. */
function parseFilters(queryInput: unknown) {
  const parsed = filterSchema.safeParse(queryInput);
  if (!parsed.success) {
    throw AppError.validation(
      'Some of the filter parameters were not valid.',
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(query)',
        message: issue.message,
      })),
    );
  }

  const severity = parsed.data.severity?.filter((level): level is SeverityLevel =>
    (SEVERITY_LEVELS as readonly string[]).includes(level),
  );

  return {
    from: parsed.data.from,
    to: parsed.data.to,
    city: parsed.data.city,
    species: parsed.data.species,
    severity,
    source: parsed.data.source,
    recentOnly: parsed.data.recentOnly,
  };
}

/** Sightings per ITL1 region — "number of sightings per region" from the brief. */
insightsRouter.get(
  '/regions',
  asyncHandler(async (req, res) => {
    const data = await insightsByRegion(parseFilters(req.query));
    res.json({ data });
  }),
);

/**
 * Sightings over time, bucketed weekly, monthly or yearly.
 *
 * The interval is validated against a closed set here rather than passed
 * through, because it is interpolated into `date_trunc` — that function needs
 * a literal, so it cannot be a bound parameter, and a whitelist is what makes
 * the interpolation safe.
 */
insightsRouter.get(
  '/trends',
  asyncHandler(async (req, res) => {
    const interval = z
      .enum(['week', 'month', 'year'])
      .default('month')
      .parse(req.query.interval ?? 'month');

    const data = await insightsTrend(parseFilters(req.query), interval);
    res.json({ data, meta: { interval } });
  }),
);

insightsRouter.get(
  '/species',
  asyncHandler(async (req, res) => {
    const data = await insightsBySpecies(parseFilters(req.query));
    res.json({ data });
  }),
);

/** Twelve months, always — including the empty ones. */
insightsRouter.get(
  '/seasonal',
  asyncHandler(async (req, res) => {
    const data = await insightsSeasonal(parseFilters(req.query));
    res.json({ data });
  }),
);

/** The headline figures behind the summary panel. */
insightsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const data = await insightsSummary(parseFilters(req.query));
    res.json({ data });
  }),
);
