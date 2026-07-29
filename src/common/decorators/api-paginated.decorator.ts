/**
 * API Paginated Decorator
 *
 * Combines Swagger decorators for paginated endpoints into a single decorator.
 * Ensures consistent API documentation across all paginated endpoints.
 *
 * Usage:
 * ```ts
 * @ApiPaginated(UserResponseDto)
 * @Get('users')
 * async listUsers(@Query() query: PaginationDto): Promise<PaginatedResult<UserResponseDto>> {
 *   // ...
 * }
 * ```
 */

import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiQuery,
  ApiOperation,
  getSchemaPath,
  ApiExtraModels,
} from '@nestjs/swagger';

/**
 * @ApiPaginatedResponse(dtoType, options?)
 *
 * Generates Swagger documentation for a paginated endpoint.
 * Documents the response schema, pagination query parameters,
 * and HATEOAS links.
 *
 * @param dtoType - The DTO class for the items in the paginated response
 * @param options - Optional configuration
 */
export function ApiPaginated(
  dtoType: Type<unknown>,
  options?: {
    /** Endpoint description */
    description?: string;
    /** Whether cursor-based pagination is also supported */
    supportsCursor?: boolean;
  },
) {
  const decorators: MethodDecorator[] = [
    ApiExtraModels(dtoType),
    ApiQuery({
      name: 'page',
      required: false,
      type: Number,
      description: 'Page number (1-based)',
      example: 1,
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      description: 'Items per page (max 100)',
      example: 20,
    }),
    ApiQuery({
      name: 'sort',
      required: false,
      type: String,
      description: 'Sort field and direction (e.g., "createdAt:desc")',
      example: 'createdAt:desc',
    }),
  ];

  if (options?.supportsCursor) {
    decorators.push(
      ApiQuery({
        name: 'after',
        required: false,
        type: String,
        description: 'Cursor for forward pagination',
      }),
      ApiQuery({
        name: 'first',
        required: false,
        type: Number,
        description: 'Number of items to fetch (cursor-based)',
      }),
    );
  }

  decorators.push(
    ApiOkResponse({
      description: options?.description ?? 'Paginated list of resources',
      schema: {
        allOf: [
          {
            properties: {
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(dtoType) },
              },
              meta: {
                type: 'object',
                properties: {
                  page: { type: 'number', example: 1 },
                  limit: { type: 'number', example: 20 },
                  totalItems: { type: 'number', example: 150 },
                  totalPages: { type: 'number', example: 8 },
                  hasNext: { type: 'boolean', example: true },
                  hasPrevious: { type: 'boolean', example: false },
                },
              },
              links: {
                type: 'object',
                properties: {
                  self: { type: 'string', example: '/api/v1/users?page=1&limit=20' },
                  first: { type: 'string', example: '/api/v1/users?page=1&limit=20' },
                  prev: { type: 'string', nullable: true, example: null },
                  next: {
                    type: 'string',
                    nullable: true,
                    example: '/api/v1/users?page=2&limit=20',
                  },
                  last: { type: 'string', example: '/api/v1/users?page=8&limit=20' },
                },
              },
            },
          },
        ],
      },
    }),
  );

  return applyDecorators(...decorators);
}
