/**
 * The error taxonomy.
 *
 * Every error the API returns is one of these, so the error middleware can map
 * a thrown value to a status code and a stable machine-readable code without a
 * chain of `instanceof` checks against library-specific types.
 *
 * Two rules the whole server follows:
 *
 *  - `message` is always safe to show a user. Anything that would leak a
 *    connection string, a stack frame or an internal table name goes to
 *    `cause` and is logged, never serialised into a response.
 *  - `code` is stable. Clients may branch on it; they must never have to
 *    string-match a message.
 */

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_MALFORMED'
  | 'DATABASE_UNAVAILABLE'
  | 'PAYLOAD_TOO_LARGE'
  | 'CONFLICT'
  | 'INTERNAL';

export interface FieldIssue {
  field: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: FieldIssue[] | undefined;
  /** True when the same request could plausibly succeed if retried. */
  readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    status: number,
    message: string,
    options: { details?: FieldIssue[]; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = options.details;
    this.retryable = options.retryable ?? status >= 500;
  }

  static validation(message: string, details?: FieldIssue[]): AppError {
    return new AppError('VALIDATION_FAILED', 400, message, {
      ...(details ? { details } : {}),
      retryable: false,
    });
  }

  static notFound(message = 'The requested resource could not be found.'): AppError {
    return new AppError('NOT_FOUND', 404, message, { retryable: false });
  }

  static upstreamUnavailable(message: string, cause?: unknown): AppError {
    return new AppError('UPSTREAM_UNAVAILABLE', 502, message, {
      retryable: true,
      cause,
    });
  }

  static upstreamRateLimited(message: string): AppError {
    return new AppError('UPSTREAM_RATE_LIMITED', 429, message, { retryable: true });
  }

  static upstreamMalformed(message: string, cause?: unknown): AppError {
    return new AppError('UPSTREAM_MALFORMED', 502, message, {
      retryable: false,
      cause,
    });
  }

  static databaseUnavailable(cause?: unknown): AppError {
    return new AppError(
      'DATABASE_UNAVAILABLE',
      503,
      'The service is temporarily unable to reach its database. Please try again shortly.',
      { retryable: true, cause },
    );
  }

  static internal(cause?: unknown): AppError {
    return new AppError('INTERNAL', 500, 'Something went wrong handling that request.', {
      retryable: true,
      cause,
    });
  }
}

/**
 * Recognises the `pg` driver's connection-level failures.
 *
 * These arrive as plain `Error`s with a `code` property, so without this the
 * error middleware would classify "Postgres is down" as a generic 500 and the
 * client would have no way to tell a transient outage from a bug.
 */
const PG_CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
  '08000', // connection_exception
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
]);

export function isDatabaseConnectionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && PG_CONNECTION_CODES.has(code);
}
