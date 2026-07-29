/**
 * Request Context
 *
 * Carries per-request metadata through the entire request lifecycle.
 * Attached to every request by middleware and propagated to all layers.
 *
 * This is the single source of truth for "who is making this request"
 * and "where is it coming from."
 *
 * Usage in guards/interceptors:
 * ```ts
 * const ctx: RequestContext = req.context;
 * const userId = ctx.userId;
 * ```
 */

export interface RequestContext {
  /** Unique identifier for this request (UUID) */
  requestId: string;

  /** ID of the authenticated user (null for anonymous requests) */
  userId: string | null;

  /** ID of the current tenant (null for non-tenant-scoped requests) */
  tenantId: string | null;

  /**
   * Correlation ID for distributed tracing.
   * Propagated across service boundaries via X-Correlation-Id header.
   * Links all operations belonging to the same logical transaction.
   */
  correlationId: string;

  /** Client IP address (respects X-Forwarded-For) */
  ipAddress: string;

  /** Client User-Agent string */
  userAgent: string;

  /** ISO 639-1 language code from Accept-Language header */
  locale: string;

  /** Timestamp when the request was received */
  receivedAt: Date;
}

/**
 * Extend Express Request to include RequestContext.
 * This makes ctx available on every request without type assertions.
 */
declare module 'express-serve-static-core' {
  interface Request {
    context: RequestContext;
  }
}

/**
 * Create a RequestContext with sensible defaults.
 */
export function createRequestContext(overrides?: Partial<RequestContext>): RequestContext {
  return {
    requestId: overrides?.requestId ?? crypto.randomUUID(),
    userId: overrides?.userId ?? null,
    tenantId: overrides?.tenantId ?? null,
    correlationId: overrides?.correlationId ?? crypto.randomUUID(),
    ipAddress: overrides?.ipAddress ?? '127.0.0.1',
    userAgent: overrides?.userAgent ?? 'unknown',
    locale: overrides?.locale ?? 'en',
    receivedAt: overrides?.receivedAt ?? new Date(),
  };
}
