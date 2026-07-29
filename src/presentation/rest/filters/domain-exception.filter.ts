/**
 * DomainException Filter — Maps domain errors to HTTP responses
 *
 * Catches exceptions thrown by the domain layer and maps them
 * to appropriate HTTP status codes with RFC 7807 Problem Details.
 *
 * Error mapping:
 * - UserNotFound → 404
 * - EmailExists → 409
 * - InvalidCredentials → 401
 * - UserSuspended → 403
 * - ValidationError → 422
 * - ConcurrencyConflict → 409
 */
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCode, DomainError } from '../../../domain/common/result';
import { ProblemDetailsDto } from '../dto/api-response.dto';

/**
 * Custom exception class for domain errors.
 * Wraps DomainError so it can be caught by NestJS exception filters.
 */
export class DomainException extends Error {
  constructor(public readonly domainError: DomainError) {
    super(domainError.message);
    this.name = 'DomainException';
  }
}

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: DomainException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const domainError = exception.domainError;

    const status = this.mapErrorCodeToHttpStatus(domainError.code);

    const problemDetails: ProblemDetailsDto = {
      type: `https://enterprise.system/errors/${domainError.code.toLowerCase().replace(/_/g, '-')}`,
      title: this.getHumanReadableTitle(domainError.code),
      status,
      detail: domainError.message,
      instance: request.url,
      code: domainError.code,
      timestamp: new Date().toISOString(),
      requestId: (request as any).requestId,
    };

    // Include field errors if present in details
    if (domainError.details?.errors) {
      problemDetails.errors = domainError.details.errors as any;
    }

    // Log domain errors at appropriate level
    if (status >= 500) {
      this.logger.error(
        `Domain error: ${domainError.code} - ${domainError.message}`,
        domainError.cause?.stack,
      );
    } else {
      this.logger.warn(
        `Domain error: ${domainError.code} - ${domainError.message}`,
      );
    }

    response.status(status).json(problemDetails);
  }

  /**
   * Map domain error codes to HTTP status codes.
   */
  private mapErrorCodeToHttpStatus(code: ErrorCode): HttpStatus {
    const mapping: Record<string, HttpStatus> = {
      // Validation errors → 422
      [ErrorCode.VALIDATION_ERROR]: HttpStatus.UNPROCESSABLE_ENTITY,
      [ErrorCode.INVALID_EMAIL]: HttpStatus.UNPROCESSABLE_ENTITY,
      [ErrorCode.INVALID_PASSWORD]: HttpStatus.UNPROCESSABLE_ENTITY,

      // Not found → 404
      [ErrorCode.USER_NOT_FOUND]: HttpStatus.NOT_FOUND,
      [ErrorCode.ROLE_NOT_FOUND]: HttpStatus.NOT_FOUND,
      [ErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,

      // Conflict → 409
      [ErrorCode.USER_ALREADY_EXISTS]: HttpStatus.CONFLICT,
      [ErrorCode.ROLE_ALREADY_ASSIGNED]: HttpStatus.CONFLICT,
      [ErrorCode.CONCURRENCY_CONFLICT]: HttpStatus.CONFLICT,

      // Authentication → 401
      [ErrorCode.INVALID_CREDENTIALS]: HttpStatus.UNAUTHORIZED,
      [ErrorCode.TOKEN_EXPIRED]: HttpStatus.UNAUTHORIZED,
      [ErrorCode.TOKEN_INVALID]: HttpStatus.UNAUTHORIZED,
      [ErrorCode.REFRESH_TOKEN_REVOKED]: HttpStatus.UNAUTHORIZED,

      // Authorization → 403
      [ErrorCode.FORBIDDEN]: HttpStatus.FORBIDDEN,
      [ErrorCode.USER_SUSPENDED]: HttpStatus.FORBIDDEN,
      [ErrorCode.ACCOUNT_LOCKED]: HttpStatus.FORBIDDEN,

      // Bad state → 400
      [ErrorCode.USER_INACTIVE]: HttpStatus.BAD_REQUEST,
      [ErrorCode.INVALID_STATUS_TRANSITION]: HttpStatus.BAD_REQUEST,

      // Rate limiting → 429
      [ErrorCode.TOO_MANY_ATTEMPTS]: HttpStatus.TOO_MANY_REQUESTS,

      // Infrastructure → 500
      [ErrorCode.TRANSACTION_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
      [ErrorCode.EXTERNAL_SERVICE_ERROR]: HttpStatus.BAD_GATEWAY,
      [ErrorCode.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
    };

    return mapping[code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
  }

  /**
   * Convert error code to human-readable title.
   */
  private getHumanReadableTitle(code: ErrorCode): string {
    return code
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
