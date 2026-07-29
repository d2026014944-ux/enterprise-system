/**
 * Transform Interceptor — Standard API response envelope
 *
 * Wraps all successful responses in a consistent envelope:
 * {
 *   data: <payload>,
 *   meta: { requestId, timestamp }
 * }
 *
 * This ensures every API response follows the same structure,
 * making the API predictable for consumers.
 *
 * Error responses are handled by exception filters (not here).
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { Request, Response } from 'express';
import { ApiResponseDto, ResponseMeta } from '../dto/api-response.dto';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponseDto<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponseDto<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        // If the response is already wrapped (e.g., from a controller that
        // explicitly returns the envelope), don't double-wrap
        if (
          data &&
          typeof data === 'object' &&
          'data' in data &&
          'meta' in data
        ) {
          return data as ApiResponseDto<T>;
        }

        // If the response is a stream or file, pass through
        if (data instanceof Buffer || data instanceof ReadableStream) {
          return data;
        }

        const meta: ResponseMeta = {
          requestId: (request as any).requestId,
          timestamp: new Date().toISOString(),
        };

        // Extract pagination metadata if present
        if (data && typeof data === 'object' && 'items' in data && 'total' in data) {
          const paginated = data as {
            items: T[];
            total: number;
            page: number;
            limit: number;
          };
          const totalPages = Math.ceil(paginated.total / paginated.limit);

          return {
            data: paginated.items,
            meta: {
              ...meta,
              total: paginated.total,
              page: paginated.page,
              limit: paginated.limit,
              totalPages,
              hasNext: paginated.page < totalPages,
              hasPrev: paginated.page > 1,
            },
          };
        }

        return { data, meta };
      }),
    );
  }
}
