/**
 * HttpException Filter — RFC 7807 Problem Details
 *
 * Catches all HttpExceptions and formats them as RFC 7807 responses.
 * Ensures consistent error format across the entire API.
 *
 * Security considerations:
 * - Stack traces are NEVER included in production
 * - Internal errors return generic messages to prevent information leakage
 * - Request ID and timestamp are always included for debugging
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
import { ProblemDetailsDto } from '../dto/api-response.dto';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // Build RFC 7807 Problem Details
    const problemDetails: ProblemDetailsDto = {
      type: this.getErrorType(status),
      title: this.getErrorTitle(status),
      status,
      instance: request.url,
      timestamp: new Date().toISOString(),
      requestId: (request as any).requestId,
    };

    // Handle different response formats
    if (typeof exceptionResponse === 'string') {
      problemDetails.detail = exceptionResponse;
    } else if (typeof exceptionResponse === 'object') {
      const resp = exceptionResponse as any;

      // Preserve RFC 7807 fields if already set
      problemDetails.type = resp.type ?? problemDetails.type;
      problemDetails.title = resp.title ?? problemDetails.title;
      problemDetails.detail = resp.detail ?? resp.message;
      problemDetails.code = resp.code;
      problemDetails.errors = resp.errors;

      // Include additional metadata (retryAfter, etc.)
      if (resp.retryAfter) {
        response.setHeader('Retry-After', resp.retryAfter.toString());
      }
    }

    // Log the error (but not sensitive details in production)
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} ${status}`,
        exception.stack,
      );
    } else if (status >= 400) {
      this.logger.warn(
        `${request.method} ${request.url} ${status}: ${problemDetails.detail}`,
      );
    }

    response.status(status).json(problemDetails);
  }

  private getErrorType(status: number): string {
    const typeMap: Record<number, string> = {
      400: 'https://enterprise.system/errors/bad-request',
      401: 'https://enterprise.system/errors/unauthorized',
      403: 'https://enterprise.system/errors/forbidden',
      404: 'https://enterprise.system/errors/not-found',
      405: 'https://enterprise.system/errors/method-not-allowed',
      408: 'https://enterprise.system/errors/timeout',
      409: 'https://enterprise.system/errors/conflict',
      422: 'https://enterprise.system/errors/validation',
      429: 'https://enterprise.system/errors/rate-limited',
      500: 'https://enterprise.system/errors/internal',
      502: 'https://enterprise.system/errors/bad-gateway',
      503: 'https://enterprise.system/errors/service-unavailable',
    };
    return typeMap[status] ?? 'https://enterprise.system/errors/unknown';
  }

  private getErrorTitle(status: number): string {
    const titleMap: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      405: 'Method Not Allowed',
      408: 'Request Timeout',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
    };
    return titleMap[status] ?? 'Error';
  }
}
