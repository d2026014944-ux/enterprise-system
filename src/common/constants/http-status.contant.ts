/**
 * HTTP Status Constants
 *
 * Custom HTTP status codes and standard response messages.
 * Extends the standard HTTP status codes with application-specific ones.
 *
 * Naming convention: UPPER_SNAKE_CASE for codes, camelCase for messages.
 */

// ─── Custom HTTP Status Codes ─────────────────────────────

/**
 * Custom status codes not in the HTTP standard.
 * Range: 4xx for client errors, 5xx for server errors.
 */
export const CUSTOM_HTTP_STATUS = {
  /** The request was rate limited (429 is standard, but we add details) */
  RATE_LIMITED: 429,

  /** The resource has been soft-deleted and is recoverable */
  GONE_RECOVERABLE: 410,

  /** The request contains a conflict with the current state */
  CONFLICT: 409,

  /** Unprocessable Entity — semantic validation failure (RFC 4918) */
  UNPROCESSABLE_ENTITY: 422,

  /** Request too large */
  PAYLOAD_TOO_LARGE: 413,

  /** Too many concurrent requests from this client */
  TOO_MANY_CONCURRENT: 429,

  /** The API version is no longer supported */
  VERSION_DEPRECATED: 400,

  /** Internal dependency failure (mapped to 502 externally) */
  DEPENDENCY_FAILURE: 502,

  /** Service temporarily unavailable (maintenance mode) */
  SERVICE_UNAVAILABLE: 503,

  /** Gateway timeout */
  GATEWAY_TIMEOUT: 504,
} as const;

// ─── Standard Response Messages ───────────────────────────

export const RESPONSE_MESSAGES = {
  // Success
  SUCCESS: 'Operation completed successfully.',
  CREATED: 'Resource created successfully.',
  UPDATED: 'Resource updated successfully.',
  DELETED: 'Resource deleted successfully.',
  NO_CONTENT: 'No content.',

  // Client Errors
  BAD_REQUEST: 'The request is invalid or malformed.',
  UNAUTHORIZED: 'Authentication is required to access this resource.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  CONFLICT: 'The request conflicts with the current state of the resource.',
  UNPROCESSABLE: 'The request was well-formed but contains semantic errors.',
  PAYLOAD_TOO_LARGE: 'The request body exceeds the maximum allowed size.',
  RATE_LIMITED: 'Too many requests. Please try again later.',
  VALIDATION_FAILED: 'Input validation failed. Check the errors field for details.',

  // Server Errors
  INTERNAL_ERROR: 'An unexpected error occurred. Please try again later.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable. Please try again later.',
  DEPENDENCY_FAILURE: 'An upstream service is unavailable. Please try again later.',
  NOT_IMPLEMENTED: 'This feature is not yet implemented.',
} as const;

// ─── RFC 7807 Problem Details ─────────────────────────────

/**
 * RFC 7807 Problem Details type.
 * Used as the standard error response format.
 *
 * @see https://www.rfc-editor.org/rfc/rfc7807
 */
export interface ProblemDetails {
  /** A URI reference that identifies the problem type */
  type: string;
  /** A short, human-readable summary of the problem type */
  title: string;
  /** The HTTP status code */
  status: number;
  /** A human-readable explanation specific to this occurrence */
  detail?: string;
  /** A URI reference that identifies the specific occurrence */
  instance?: string;
  /** Application-specific error code */
  code?: string;
  /** Additional error context */
  errors?: Record<string, unknown>[];
  /** Request ID for correlation */
  requestId?: string;
}

/**
 * Build a standard success response envelope.
 */
export function buildSuccessResponse<T>(data: T, meta?: Record<string, unknown>) {
  return {
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

/**
 * Build a standard error response (RFC 7807).
 */
export function buildErrorResponse(
  type: string,
  title: string,
  status: number,
  detail?: string,
  extras?: Partial<ProblemDetails>,
): ProblemDetails {
  return {
    type: `https://enterprise.system/errors/${type}`,
    title,
    status,
    detail,
    ...extras,
  };
}

// ─── Status Code Helpers ──────────────────────────────────

/**
 * Check if a status code indicates success (2xx).
 */
export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * Check if a status code indicates a client error (4xx).
 */
export function isClientError(status: number): boolean {
  return status >= 400 && status < 500;
}

/**
 * Check if a status code indicates a server error (5xx).
 */
export function isServerError(status: number): boolean {
  return status >= 500 && status < 600;
}
