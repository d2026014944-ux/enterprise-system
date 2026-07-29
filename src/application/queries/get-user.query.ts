import { BaseQuery } from './base.query';
import type { Result, DomainError } from '../result';
import type { UserResponseDto } from '../dto/user-response.dto';

/**
 * GetUserQuery — Fetches a single user by ID.
 *
 * Queries are read-only and return DTOs (read models).
 * In strict CQRS, queries may use a separate read store
 * (e.g., a denormalized view optimized for reads).
 */
export class GetUserQuery extends BaseQuery {
  readonly queryName = 'GetUser';

  constructor(public readonly userId: string) {
    super();
  }
}

/**
 * GetUserQueryHandler — Fetches and returns a user DTO.
 *
 * Responsibilities:
 * 1. Look up user by ID (via repository or read model)
 * 2. Map to UserResponseDto
 * 3. Return Result.fail if not found
 */
export interface GetUserQueryHandler {
  execute(query: GetUserQuery): Promise<Result<UserResponseDto, DomainError>>;
}
