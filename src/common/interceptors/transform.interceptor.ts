/**
 * Transform Interceptor
 *
 * Wraps all successful responses in a standard envelope:
 * ```json
 * {
 *   "data": { ... },
 *   "meta": {
 *     "timestamp": "2024-01-01T00:00:00.000Z",
 *     "requestId": "abc-123"
 *   },
 *   "links": {
 *     "self": "/api/v1/users/123"
 *   }
 * }
 * ```
 *
 * HATEOAS links are auto-generated based on the request path.
 * Paginated responses pass through unchanged (they already have meta/links).
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';

export interface Envelope<T> {
  data: T;
  meta: ResponseMeta;
  links?: HATEOASLinks;
}

export interface ResponseMeta {
  timestamp: string;
  requestId: string;
  version: string;
}

export interface HATEOASLinks {
  self: string;
  [rel: string]: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Envelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Envelope<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestId =
      (request.headers['x-request-id'] as string) ||
      (request as any).context?.requestId ||
      'unknown';

    return next.handle().pipe(
      map((data: T) => {
        // If the response is already wrapped (e.g., paginated results with meta),
        // pass it through with only the meta enrichment
        if (this.isAlreadyWrapped(data)) {
          return {
            ...data,
            meta: {
              timestamp: new Date().toISOString(),
              requestId,
              version: process.env.API_VERSION || '1.0.0',
              ...(data as any).meta,
            },
          };
        }

        // Wrap in standard envelope
        return {
          data,
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
            version: process.env.API_VERSION || '1.0.0',
          },
          links: {
            self: `${request.protocol}://${request.get('host')}${request.originalUrl}`,
          },
        };
      }),
    );
  }

  /**
   * Check if the data is already in envelope format.
   * Paginated results from the application layer already include data + meta.
   */
  private isAlreadyWrapped(data: unknown): boolean {
    if (data === null || data === undefined || typeof data !== 'object') {
      return false;
    }

    const obj = data as Record<string, unknown>;
    return (
      'data' in obj &&
      'meta' in obj &&
      Array.isArray(obj.data)
    );
  }
}
