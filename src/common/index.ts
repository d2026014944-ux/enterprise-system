/**
 * Common Layer — Barrel Export
 *
 * Shared types, utilities, validators, decorators, filters,
 * interceptors, and constants used across all layers.
 */

// ─── Types ────────────────────────────────────────────────
export { Result, ErrorCode, createError, type DomainError } from './types/result.type';
export {
  type OffsetPagination,
  type OffsetPaginationMeta,
  type CursorPagination,
  type CursorPaginationMeta,
  type PaginatedResult,
  type PaginationLinks,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  normalizeOffsetPagination,
  buildOffsetMeta,
  buildCursorMeta,
} from './types/pagination.type';
export { type RequestContext, createRequestContext } from './types/request-context.type';

// ─── Utils ────────────────────────────────────────────────
export {
  retry,
  timeout,
  TimeoutError,
  parallel,
  circuitBreaker,
  CircuitBreaker,
  CircuitOpenError,
  type RetryOptions,
  type TimeoutOptions,
  type ParallelOptions,
  type CircuitBreakerOptions,
  type CircuitState,
} from './utils/async.util';
export {
  secureRandom,
  secureToken,
  generateUuidV4,
  isValidUuidV4,
  hmacSign,
  hmacVerify,
  constantTimeCompare,
  hashPassword,
  verifyPassword,
} from './utils/crypto.util';
export {
  toUtcDate,
  toUtcString,
  parseDate,
  parseDateOrThrow,
  formatDate,
  durationBetween,
  formatDuration,
  isExpired,
  isWithinDays,
  relativeTime,
  type Duration,
} from './utils/date.util';

// ─── Validators ───────────────────────────────────────────
export { IsUnique, IsUniqueConstraint } from './validators/is-unique.validator';
export { IsUuidV4, IsUuidV4Constraint } from './validators/is-uuid.validator';

// ─── Constants ────────────────────────────────────────────
export {
  CUSTOM_HTTP_STATUS,
  RESPONSE_MESSAGES,
  type ProblemDetails,
  buildSuccessResponse,
  buildErrorResponse,
  isSuccessStatus,
  isClientError,
  isServerError,
} from './constants/http-status.contant';

// ─── Decorators ───────────────────────────────────────────
export { CurrentUser } from './decorators/current-user.decorator';
export { ApiPaginated } from './decorators/api-paginated.decorator';

// ─── Filters ──────────────────────────────────────────────
export { AllExceptionsFilter } from './filters/all-exceptions.filter';

// ─── Interceptors ─────────────────────────────────────────
export {
  TransformInterceptor,
  type Envelope,
  type ResponseMeta,
  type HATEOASLinks,
} from './interceptors/transform.interceptor';
