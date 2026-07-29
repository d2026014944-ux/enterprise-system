/**
 * Pagination Types
 *
 * Supports both cursor-based and offset-based pagination.
 *
 * Cursor-based pagination is preferred for:
 * - Real-time data feeds
 * - Large datasets (no OFFSET performance penalty)
 * - Consistent results during data mutations
 *
 * Offset-based pagination is suitable for:
 * - Admin dashboards with stable data
 * - Jump-to-page UI patterns
 *
 * Reference: GraphQL Cursor Connections Specification
 * Reference: JSON:API Pagination
 */

// ─── Offset-Based Pagination ──────────────────────────────

export interface OffsetPagination {
  /** 1-based page number */
  page: number;
  /** Number of items per page */
  limit: number;
}

export interface OffsetPaginationMeta {
  /** Current page number (1-based) */
  page: number;
  /** Items per page */
  limit: number;
  /** Total number of items */
  totalItems: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there is a next page */
  hasNext: boolean;
  /** Whether there is a previous page */
  hasPrevious: boolean;
}

// ─── Cursor-Based Pagination ──────────────────────────────

export interface CursorPagination {
  /** Opaque cursor pointing to the start position */
  after?: string;
  /** Opaque cursor pointing to the end position */
  before?: string;
  /** Number of items to fetch forward */
  first?: number;
  /** Number of items to fetch backward */
  last?: number;
}

export interface CursorPaginationMeta {
  /** Cursor of the first item in the result set */
  startCursor: string | null;
  /** Cursor of the last item in the result set */
  endCursor: string | null;
  /** Whether more items exist forward */
  hasNextPage: boolean;
  /** Whether more items exist backward */
  hasPreviousPage: boolean;
}

// ─── Paginated Result ─────────────────────────────────────

/**
 * Generic paginated result container.
 * Works with both cursor and offset pagination strategies.
 */
export interface PaginatedResult<T> {
  /** The items for the current page */
  data: T[];
  /** Pagination metadata (offset or cursor) */
  meta: OffsetPaginationMeta | CursorPaginationMeta;
  /** HATEOAS links */
  links?: PaginationLinks;
}

/**
 * HATEOAS-style pagination links.
 * Follows RFC 8288 (Web Linking) conventions.
 */
export interface PaginationLinks {
  /** Link to the first page */
  first: string;
  /** Link to the previous page */
  prev: string | null;
  /** Link to the current page */
  self: string;
  /** Link to the next page */
  next: string | null;
  /** Link to the last page */
  last: string;
}

// ─── Default Pagination ───────────────────────────────────

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * Normalize pagination parameters with defaults and bounds.
 */
export function normalizeOffsetPagination(
  page?: number,
  limit?: number,
): Required<OffsetPagination> {
  const normalizedPage = Math.max(1, page ?? DEFAULT_PAGE);
  const normalizedLimit = Math.min(Math.max(1, limit ?? DEFAULT_LIMIT), MAX_LIMIT);

  return {
    page: normalizedPage,
    limit: normalizedLimit,
  };
}

/**
 * Build offset pagination metadata.
 */
export function buildOffsetMeta(
  page: number,
  limit: number,
  totalItems: number,
): OffsetPaginationMeta {
  const totalPages = Math.ceil(totalItems / limit);

  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

/**
 * Build cursor pagination metadata from a list of nodes.
 * Assumes each node has an `id` field used as cursor.
 */
export function buildCursorMeta<T extends { id: string }>(
  data: T[],
  first: number,
  hasMore: boolean,
): CursorPaginationMeta {
  return {
    startCursor: data.length > 0 ? data[0].id : null,
    endCursor: data.length > 0 ? data[data.length - 1].id : null,
    hasNextPage: hasMore,
    hasPreviousPage: false, // Set by caller if needed
  };
}
