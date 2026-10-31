/**
 * `/api/sightings` — search, read and create.
 *
 * Query parameters are parsed and validated with zod before anything reaches
 * SQL, so a handler never sees a string where it expected a date. Invalid
 * input produces a 400 with per-field messages rather than a 500 from deep in
 * the query layer.
 */

import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import {
  createSighting,
  deleteSighting,
  findSightingById,
  findSightingImage,
  findSightings,
} from '../db/sightingsRepo.js';
import { AppError } from '../lib/errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { SEVERITY_LEVELS } from '../types.js';
import { CITY_NAMES } from '../domain/cities.js';
import { SPECIES_NAMES } from '../domain/species.js';
import type { SightingsResponse } from '../types.js';

export const sightingsRouter = Router();

/**
 * Express 5 types a route parameter as `string | string[]`, because a wildcard
 * segment can match repeatedly. `:id` never can, but the type does not know
 * that — so this narrows it once rather than casting at three call sites.
 */
function pathParam(value: string | string[] | undefined, name: string): string {
  const single = Array.isArray(value) ? value[0] : value;
  if (typeof single !== 'string' || single.trim() === '') {
    throw AppError.validation(`A ${name} is required.`);
  }
  return single;
}


/** `YYYY-MM-DD`, and a real date — `2024-02-31` is caught here, not by SQL. */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.')
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()), {
    message: 'That is not a real date.',
  });

/**
 * Accepts either `?species=a&species=b` or `?species=a,b`.
 *
 * Both forms are common in the wild and neither is wrong, so supporting both
 * is cheaper than making every client guess which one this API wants.
 */
const multiValue = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const list = Array.isArray(value) ? value : value.split(',');
    const cleaned = list.map((item) => item.trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : undefined;
  });

const booleanFlag = z
  .union([z.literal('true'), z.literal('false'), z.boolean()])
  .optional()
  .transform((value) => value === true || value === 'true');

const listQuerySchema = z
  .object({
    from: dateString.optional(),
    to: dateString.optional(),
    city: z.string().trim().min(1).optional(),
    species: multiValue,
    severity: multiValue,
    source: z.enum(['elanco', 'user']).optional(),
    recentOnly: booleanFlag,
    limit: z.coerce.number().int().positive().max(config.MAX_PAGE_SIZE).default(1000),
    offset: z.coerce.number().int().min(0).default(0),
  })
  // Caught here rather than silently returning nothing, because an empty
  // result with no explanation is indistinguishable from a broken endpoint.
  .refine((value) => !(value.from && value.to) || value.from <= value.to, {
    message: 'The "from" date must not be after the "to" date.',
    path: ['from'],
  });

/* ------------------------------------------------------------------ list */

sightingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw AppError.validation(
        'Some of the search parameters were not valid.',
        parsed.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(query)',
          message: issue.message,
        })),
      );
    }

    const q = parsed.data;

    // Unknown severity values are rejected rather than ignored: silently
    // dropping an unrecognised filter returns more data than the caller asked
    // for, which is the wrong way to fail.
    const severity = q.severity?.filter((level): level is (typeof SEVERITY_LEVELS)[number] =>
      (SEVERITY_LEVELS as readonly string[]).includes(level),
    );
    if (q.severity && severity && severity.length !== q.severity.length) {
      throw AppError.validation('Unknown severity level.', [
        {
          field: 'severity',
          message: `Valid levels are: ${SEVERITY_LEVELS.join(', ')}.`,
        },
      ]);
    }

    const { data, total, facets } = await findSightings(
      {
        from: q.from,
        to: q.to,
        city: q.city,
        species: q.species,
        severity,
        source: q.source,
        recentOnly: q.recentOnly,
      },
      q.limit,
      q.offset,
    );

    const body: SightingsResponse = {
      data,
      meta: { total, returned: data.length, limit: q.limit, offset: q.offset },
      facets,
    };

    res.json(body);
  }),
);

/* ---------------------------------------------------------------- create */

const createSchema = z.object({
  date: dateString,
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour format, for example 14:30.'),
  location: z
    .string()
    .trim()
    .min(1, 'Choose the nearest city.')
    .refine((value) => CITY_NAMES.some((city) => city.toLowerCase() === value.toLowerCase()), {
      message: 'That is not one of the cities this tracker covers.',
    }),
  species: z
    .string()
    .trim()
    .min(1, 'Choose a species, or "Unidentified tick" if you cannot tell.')
    .refine(
      (value) =>
        value === 'Unidentified tick' ||
        SPECIES_NAMES.some((name) => name.toLowerCase() === value.toLowerCase()),
      { message: 'That species is not one this tracker recognises.' },
    ),
  notes: z.string().trim().max(500, 'Notes are limited to 500 characters.').optional(),
  imageDataUrl: z
    .string()
    .regex(
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/,
      'The image must be a base64 data URL for a JPEG, PNG or WebP.',
    )
    .optional(),
  imageAlt: z.string().trim().max(160).optional(),
  reporterName: z.string().trim().max(80).optional(),
});

sightingsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.validation(
        'The sighting could not be saved because some values were not valid.',
        parsed.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(body)',
          message: issue.message,
        })),
      );
    }

    const input = parsed.data;

    // A sighting cannot have happened in the future. Checked here rather than
    // in the schema because it needs "now", which makes the schema impure.
    const observed = new Date(`${input.date}T${input.time}:00`);
    if (observed.getTime() > Date.now() + 60_000) {
      throw AppError.validation('That sighting is dated in the future.', [
        { field: 'date', message: 'A sighting has to have already happened.' },
      ]);
    }

    const created = await createSighting({
      date: input.date,
      time: input.time,
      location: input.location,
      species: input.species,
      notes: input.notes,
      imageDataUrl: input.imageDataUrl,
      imageAlt: input.imageAlt,
      reporterName: input.reporterName,
    });

    res.status(201).location(`/api/sightings/${created.id}`).json({ data: created });
  }),
);

/* ------------------------------------------------------------------ read */

sightingsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = pathParam(req.params.id, 'sighting id');

    const sighting = await findSightingById(id);
    if (!sighting) throw AppError.notFound('No sighting exists with that id.');

    res.json({ data: sighting });
  }),
);

/**
 * Serves an attached photograph.
 *
 * Images are kept out of the list and detail payloads and fetched separately,
 * so a 1,000-record response is ~400 KB of JSON rather than tens of megabytes
 * of base64 the map will never display.
 */
sightingsRouter.get(
  '/:id/image',
  asyncHandler(async (req, res) => {
    const id = pathParam(req.params.id, 'sighting id');

    const image = await findSightingImage(id);
    if (!image) throw AppError.notFound('That sighting has no photograph.');

    const match = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(image.data);
    if (!match?.[1] || !match[2]) {
      throw AppError.internal(new Error(`Stored image for ${id} is malformed.`));
    }

    const buffer = Buffer.from(match[2], 'base64');
    res.setHeader('Content-Type', match[1]);
    res.setHeader('Content-Length', buffer.length);
    // Immutable: an image never changes for a given sighting id.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);
  }),
);

/* ---------------------------------------------------------------- delete */

sightingsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = pathParam(req.params.id, 'sighting id');

    const deleted = await deleteSighting(id);
    if (!deleted) {
      throw AppError.notFound(
        'No user-submitted sighting exists with that id. Records from the Elanco dataset cannot be deleted.',
      );
    }

    res.status(204).end();
  }),
);
