/**
 * API Response DTOs — Standard response envelope
 *
 * All API responses follow a consistent envelope format inspired by
 * JSON:API and Google's API design guidelines.
 *
 * Success: { data, meta }
 * Error: { type, title, status, detail, instance, errors }
 *
 * The error format follows RFC 7807 (Problem Details for HTTP APIs).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Standard success response envelope.
 */
export class ApiResponseDto<T = any> {
  @ApiProperty({ description: 'The response payload' })
  data: T;

  @ApiPropertyOptional({ description: 'Pagination and metadata' })
  meta?: ResponseMeta;
}

/**
 * Pagination metadata.
 */
export class ResponseMeta {
  @ApiPropertyOptional({ description: 'Total number of items' })
  total?: number;

  @ApiPropertyOptional({ description: 'Current page number' })
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page' })
  limit?: number;

  @ApiPropertyOptional({ description: 'Total number of pages' })
  totalPages?: number;

  @ApiPropertyOptional({ description: 'Whether there is a next page' })
  hasNext?: boolean;

  @ApiPropertyOptional({ description: 'Whether there is a previous page' })
  hasPrev?: boolean;

  @ApiPropertyOptional({ description: 'Request correlation ID' })
  requestId?: string;

  @ApiPropertyOptional({ description: 'Response timestamp (ISO 8601)' })
  timestamp?: string;
}

/**
 * RFC 7807 Problem Details error response.
 * @see https://www.rfc-editor.org/rfc/rfc7807
 */
export class ProblemDetailsDto {
  @ApiProperty({
    description: 'A URI reference that identifies the problem type',
    example: 'https://enterprise.system/errors/validation',
  })
  type: string;

  @ApiProperty({
    description: 'A short, human-readable summary of the problem',
    example: 'Validation Error',
  })
  title: string;

  @ApiProperty({
    description: 'The HTTP status code',
    example: 422,
  })
  status: number;

  @ApiPropertyOptional({
    description: 'A human-readable explanation specific to this occurrence',
    example: 'The request body contains invalid fields.',
  })
  detail?: string;

  @ApiPropertyOptional({
    description: 'A URI reference that identifies the specific occurrence',
    example: '/api/v1/users/123',
  })
  instance?: string;

  @ApiPropertyOptional({
    description: 'Application-specific error code',
    example: 'VALIDATION_ERROR',
  })
  code?: string;

  @ApiPropertyOptional({
    description: 'Timestamp of the error',
    example: '2024-01-01T00:00:00.000Z',
  })
  timestamp?: string;

  @ApiPropertyOptional({
    description: 'Request correlation ID for tracing',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  requestId?: string;

  @ApiPropertyOptional({
    description: 'Field-level validation errors',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        field: { type: 'string' },
        message: { type: 'string' },
        value: {},
      },
    },
  })
  errors?: FieldError[];
}

/**
 * Field-level validation error.
 */
export class FieldError {
  @ApiProperty({ description: 'The field that caused the error' })
  field: string;

  @ApiProperty({ description: 'Human-readable error message' })
  message: string;

  @ApiPropertyOptional({ description: 'The rejected value' })
  value?: unknown;
}

/**
 * Paginated list response.
 */
export class PaginatedResponseDto<T = any> {
  @ApiProperty({ description: 'List of items', isArray: true })
  data: T[];

  @ApiProperty({ description: 'Pagination metadata' })
  meta: ResponseMeta;
}
