import { BaseQuery } from './base.query';
import type { Result, DomainError } from '../result';
import type { UserResponseDto } from '../dto/user-response.dto';
import type { PaginatedResult } from '../dto/pagination.dto';
import type { UserStatus } from '@domain/index';

/**
 * ListUsersQuery — Fetches a paginated, filtered, sorted list of users.
 *
 * Supports:
 * - Cursor-based pagination (preferred for infinite scroll)
 * - Offset-based pagination (for traditional page navigation)
 * - Filtering by status
 * - Full-text search on name/email
 * - Sorting by createdAt, email, or lastName
 */
export class ListUsersQuery extends BaseQuery {
  readonly queryName = 'ListUsers';

  constructor(
    public readonly limit: number = 20,
    public readonly cursor?: string,
    public readonly offset?: number,
    public readonly status?: UserStatus,
    public readonly search?: string,
    public readonly sortBy: 'createdAt' | 'email' | 'lastName' = 'createdAt',
    public readonly sortOrder: 'asc' | 'desc' = 'desc',
  ) {
    super();
  }
}

/**
 * ListUsersQueryHandler — Orchestrates paginated user listing.
 */
export interface ListUsersQueryHandler {
  execute(query: ListUsersQuery): Promise<Result<PaginatedResult<UserResponseDto>, DomainError>>;
}
