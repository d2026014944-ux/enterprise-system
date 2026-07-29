/**
 * Timeout Interceptor — Request timeout enforcement
 *
 * Terminates requests that exceed the configured timeout.
 * Returns 408 Request Timeout with RFC 7807 Problem Details.
 *
 * Default timeout: 30 seconds.
 * Configurable per-route via the @Timeout() decorator.
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, throwError, timeout, TimeoutError, catchError } from 'rxjs';
import { ErrorCode } from '../../../domain/common/result';

export const TIMEOUT_KEY = 'timeout';

/**
 * Decorator to set a custom timeout (in milliseconds) on a specific endpoint.
 */
export const Timeout = (ms: number) => SetMetadata(TIMEOUT_KEY, ms);

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly defaultTimeout = 30_000; // 30 seconds

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Check for custom timeout from decorator
    const customTimeout = this.reflector.get<number>(
      TIMEOUT_KEY,
      context.getHandler(),
    );

    const timeoutMs = customTimeout ?? this.defaultTimeout;

    return next.handle().pipe(
      timeout(timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(
            () =>
              new RequestTimeoutException({
                type: 'https://enterprise.system/errors/timeout',
                title: 'Request Timeout',
                status: 408,
                detail: `The request did not complete within ${timeoutMs / 1000} seconds. Please try again or reduce the request scope.`,
                code: ErrorCode.INTERNAL_ERROR,
                timeout: timeoutMs,
              }),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
