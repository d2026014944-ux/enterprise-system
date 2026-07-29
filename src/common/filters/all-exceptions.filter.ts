/**
 * All Exceptions Filter
 *
 * Global catch-all exception filter. Last line of defense.
 *
 * Responsibilities:
 * - Catch any unhandled exception
 * - Normalize to RFC 7807 Problem Details format
 * - Never expose stack traces in production
 * - Log the full error internally
 * - Assign request ID for correlation
 *
 * Error handling philosophy:
 * 1. Domain exceptions → known HTTP status + structured error
 * 2. Validation errors → 422 with field-level details
 * 3. HTTP exceptions → passthrough with envelope
 * 4. Unknown errors → 500 with generic message (no leak)
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainException } from '@domain/exceptions/domain.exception';
import { ErrorCode, type DomainError } from '@domain/common/result';
import { RESPONSE_MESSAGES } from '../constants/http-status.contant';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request.headers['x-request-id'] as string) ||
      (request as any).context?.requestId ||
      'unknown';

    // ── Domain Exceptions ──────────────────────────────
    if (exception instanceof DomainException) {
      const status = this.mapErrorCodeToStatus(exception.code);

      this.logger.warn(`Domain error: ${exception.message}`, {
        code: exception.code,
        requestId,
        path: request.url,
      });

      response.status(status).json({
        type: `https://enterprise.system/errors/${exception.code}`,
        title: this.humanizeErrorCode(exception.code),
        status,
        detail: exception.message,
        code: exception.code,
        instance: request.url,
        requestId,
        errors: exception.details,
      });
      return;
    }

    // ── HTTP Exceptions ────────────────────────────────
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      this.logger.warn(`HTTP ${status}: ${exception.message}`, {
        status,
        requestId,
        path: request.url,
      });

      // If the exception already has a structured body (from our guards), use it
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        response.status(status).json({
          ...exceptionResponse,
          instance: request.url,
          requestId,
        });
        return;
      }

      response.status(status).json({
        type: `https://enterprise.system/errors/http-${status}`,
        title: HttpStatus[status] || 'Error',
        status,
        detail: String(exceptionResponse),
        instance: request.url,
        requestId,
      });
      return;
    }

    // ── Validation Errors (class-validator) ────────────
    if (this.isValidationError(exception)) {
      this.logger.warn('Validation error', {
        requestId,
        path: request.url,
        errors: exception,
      });

      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        type: 'https://enterprise.system/errors/validation-error',
        title: 'Validation Failed',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: RESPONSE_MESSAGES.VALIDATION_FAILED,
        instance: request.url,
        requestId,
        errors: exception,
      });
      return;
    }

    // ── Unknown Errors ─────────────────────────────────
    const errorId = crypto.randomUUID();

    this.logger.error(`Unhandled exception [${errorId}]`, {
      errorId,
      requestId,
      path: request.url,
      method: request.method,
      error: exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    // In production, never expose internal error details
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      type: 'https://enterprise.system/errors/internal',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: RESPONSE_MESSAGES.INTERNAL_ERROR,
      instance: request.url,
      requestId,
      // errorId included for support correlation (not the stack trace)
      ...(process.env.NODE_ENV !== 'production' && {
        debug: {
          errorId,
          message: exception instanceof Error ? exception.message : String(exception),
        },
      }),
    });
  }

  /**
   * Map domain ErrorCode to HTTP status code.
   */
  private mapErrorCodeToStatus(code: ErrorCode): number {
    const mapping: Record<string, number> = {
      [ErrorCode.VALIDATION_ERROR]: 422,
      [ErrorCode.INVALID_EMAIL]: 422,
      [ErrorCode.INVALID_PASSWORD]: 422,
      [ErrorCode.INVALID_CREDENTIALS]: 401,
      [ErrorCode.TOKEN_EXPIRED]: 401,
      [ErrorCode.TOKEN_INVALID]: 401,
      [ErrorCode.FORBIDDEN]: 403,
      [ErrorCode.ACCOUNT_LOCKED]: 423,
      [ErrorCode.TOO_MANY_ATTEMPTS]: 429,
      [ErrorCode.REFRESH_TOKEN_REVOKED]: 401,
      [ErrorCode.USER_NOT_FOUND]: 404,
      [ErrorCode.USER_ALREADY_EXISTS]: 409,
      [ErrorCode.USER_SUSPENDED]: 403,
      [ErrorCode.USER_INACTIVE]: 403,
      [ErrorCode.INVALID_STATUS_TRANSITION]: 422,
      [ErrorCode.ROLE_NOT_FOUND]: 404,
      [ErrorCode.ROLE_ALREADY_ASSIGNED]: 409,
      [ErrorCode.NOT_FOUND]: 404,
      [ErrorCode.CONCURRENCY_CONFLICT]: 409,
      [ErrorCode.TRANSACTION_FAILED]: 500,
      [ErrorCode.EXTERNAL_SERVICE_ERROR]: 502,
      [ErrorCode.INTERNAL_ERROR]: 500,
    };

    return mapping[code] ?? 500;
  }

  /**
   * Convert ErrorCode enum to human-readable title.
   */
  private humanizeErrorCode(code: ErrorCode): string {
    return code
      .split('_')
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Check if the exception is a validation error array (from class-validator).
   */
  private isValidationError(exception: unknown): exception is Record<string, unknown>[] {
    return (
      Array.isArray(exception) &&
      exception.length > 0 &&
      'property' in exception[0] &&
      'constraints' in exception[0]
    );
  }
}
