/**
 * Logging Interceptor — Structured request/response logging
 *
 * Logs every request and response with:
 * - HTTP method, path, status code
 * - Response time in milliseconds
 * - User ID (if authenticated)
 * - Request ID and correlation ID
 * - Redacted sensitive fields
 *
 * Output is structured JSON for log aggregation (ELK, Datadog, etc.)
 *
 * Security: Redacts passwords, tokens, and authorization headers.
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

/** Fields that must never appear in logs */
const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
  'creditCard',
  'credit_card',
  'cvv',
  'ssn',
]);

/** Headers that must be redacted */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
]);

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();

    const requestLog = {
      method: request.method,
      path: request.path,
      query: this.redactObject(request.query),
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: (request as any).requestId,
      correlationId: (request as any).correlationId,
      userId: (request as any).user?.id,
    };

    this.logger.log({
      type: 'request',
      ...requestLog,
    });

    return next.handle().pipe(
      tap({
        next: (body) => {
          const duration = Date.now() - startTime;
          this.logger.log({
            type: 'response',
            ...requestLog,
            statusCode: response.statusCode,
            duration,
          });
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logger.warn({
            type: 'response_error',
            ...requestLog,
            statusCode: error.status ?? 500,
            error: error.message,
            duration,
          });
        },
      }),
    );
  }

  /**
   * Redact sensitive fields from an object.
   */
  private redactObject(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    const redacted: any = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = this.redactObject(value);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }
}
