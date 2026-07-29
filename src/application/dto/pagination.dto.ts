import { IsOptional, IsInt, Min, Max, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Pagination Query — supports both cursor-based and offset-based pagination.
 *
 * Cursor-based pagination (preferred):
 *   - `cursor`: opaque cursor from previous response
 *   - `limit`: page size
 *
 * Offset-based pagination (legacy):
 *   - `offset`: number of items to skip
 *   - `limit`: page size
 *
 * Follows Google's API Design Guide § pagination.
 */
export class PaginationQuery {
  @ApiPropertyOptional({
    description: 'Opaque cursor for cursor-based pagination',
    example: 'eyJpZCI6InVzZXItMTIzIn0=',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Number of items to skip (offset-based pagination)',
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of items to return',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['createdAt', 'email', 'lastName'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['createdAt', 'email', 'lastName'])
  sortBy?: 'createdAt' | 'email' | 'lastName' = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

/**
 * Generic paginated result wrapper.
 * Encapsulates both data and pagination metadata.
 */
export class PaginatedResult<T> {
  constructor(
    public readonly data: T[],
    public readonly total: number,
    public readonly limit: number,
    public readonly offset: number,
    public readonly nextCursor?: string,
  ) {}

  /** Whether a next page exists. */
  get hasNextPage(): boolean {
    if (this.nextCursor) return true;
    return this.offset + this.limit < this.total;
  }

  /** Whether a previous page exists. */
  get hasPreviousPage(): boolean {
    return this.offset > 0;
  }

  /** Number of items in this page. */
  get count(): number {
    return this.data.length;
  }

  /** Serializes to a JSON-serializable structure. */
  toJSON(): Record<string, unknown> {
    return {
      data: this.data,
      meta: {
        total: this.total,
        limit: this.limit,
        offset: this.offset,
        count: this.count,
        hasNextPage: this.hasNextPage,
        hasPreviousPage: this.hasPreviousPage,
        ...(this.nextCursor ? { nextCursor: this.nextCursor } : {}),
      },
    };
  }
}

/**
 * Cursor-based pagination metadata for responses.
 */
export class CursorPaginationMeta {
  constructor(
    public readonly limit: number,
    public readonly hasNextPage: boolean,
    public readonly nextCursor?: string,
  ) {}
}
