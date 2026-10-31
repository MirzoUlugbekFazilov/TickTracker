/**
 * Centralised error handling.
 *
 * One place that turns any thrown value into an HTTP response, so route
 * handlers can throw and never think about status codes or response shapes.
 *
 * The principle being enforced: **nothing internal leaks**. Stack traces,
 * SQL fragments, connection strings and driver messages go to the log; the
 * client gets a stable code and a sentence written for a human. The commonest
 * way an API becomes an information-disclosure problem is a well-meaning
 * `res.status(500).json({ error })` that serialises the whole thing.
 */

import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, isDatabaseConnectionError } from '../lib/errors.js';
import type { ApiErrorBody } from '../types.js';

/** Normalises anything thrown into an AppError. */
function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  // Zod validation failures become field-level 400s.
  if (error instanceof ZodError) {
    return AppError.validation(
      'Some of the values supplied were not valid.',
      error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    );
  }

  if (isDatabaseConnectionError(error)) {
    return AppError.databaseUnavailable(error);
  }

  // body-parser signals an oversized body with this shape. Worth catching
  // specifically: the default response is an opaque 500, where the user can
  // actually act on "your photograph is too large".
  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { type?: string }).type === 'entity.too.large'
  ) {
    return new AppError(
      'PAYLOAD_TOO_LARGE',
      413,
      'That request was too large. If you attached a photograph, try a smaller one.',
      { retryable: false },
    );
  }

  // Malformed JSON from a client.
  if (error instanceof SyntaxError && 'body' in error) {
    return AppError.validation('The request body was not valid JSON.');
  }

  return AppError.internal(error);
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const appError = toAppError(error);

  // Server-side faults are logged with their cause; client mistakes are not,
  // or a scripted 404 sweep fills the log with noise.
  if (appError.status >= 500) {
    const cause = appError.cause ?? error;
    console.error(
      `[error] ${req.method} ${req.originalUrl} -> ${appError.status} ${appError.code}:`,
      cause instanceof Error ? (cause.stack ?? cause.message) : cause,
    );
  } else if (appError.status !== 404) {
    console.warn(
      `[warn] ${req.method} ${req.originalUrl} -> ${appError.status} ${appError.code}: ${appError.message}`,
    );
  }

  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
    },
  };

  // Tells a client it is worth trying again, without it having to infer that
  // from the status code.
  if (appError.retryable) res.setHeader('X-Retryable', 'true');

  res.status(appError.status).json(body);
};

/** Terminal 404 for unmatched routes, in the same error shape as everything else. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`No route matches ${req.method} ${req.path}.`));
};

/**
 * Wraps an async handler so a rejected promise reaches the error middleware.
 *
 * Express 5 forwards rejections automatically, so this is strictly belt and
 * braces — but it is also self-documenting at each call site, and it means
 * the handlers are not silently dependent on an Express-version behaviour.
 */
export function asyncHandler<T extends RequestHandler>(handler: T): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}
