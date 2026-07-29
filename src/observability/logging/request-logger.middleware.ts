/**
 * Request Logger Middleware
 *
 * Logs every HTTP request/response with structured fields.
 * Skips health check endpoints to reduce noise.
 *
 * Fields: method, url, statusCode, responseTime, userAgent, ip
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LoggerService } from './logger.service';

/** Endpoints excluded from logging. */
const SKIP_PATHS = new Set(['/health', '/health/live', '/health/ready', '/metrics']);

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(private readonly logger: LoggerService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl, ip, headers } = req;

    // Skip health check and metrics endpoints
    if (SKIP_PATHS.has(originalUrl)) {
      next();
      return;
    }

    const startTime = process.hrtime.bigint();
    const requestId = (headers['x-request-id'] as string) || undefined;
    const correlationId = (headers['x-correlation-id'] as string) || undefined;

    // Bind request context
    this.logger.setContext({
      requestId,
      correlationId,
    });

    // Attach logger to request for downstream use
    (req as any).logger = this.logger;

    res.on('finish', () => {
      const endTime = process.hrtime.bigint();
      const responseTimeMs = Number(endTime - startTime) / 1_000_000;
      const { statusCode } = res;
      const contentLength = res.getHeader('content-length') || 0;

      this.logger.http(
        `${method} ${originalUrl} ${statusCode} ${responseTimeMs.toFixed(2)}ms`,
        {
          method,
          url: originalUrl,
          statusCode,
          responseTimeMs: Math.round(responseTimeMs * 100) / 100,
          contentLength: Number(contentLength),
          userAgent: headers['user-agent'] || 'unknown',
          ip: ip || req.socket.remoteAddress || 'unknown',
          requestId,
          correlationId,
        },
      );
    });

    next();
  }
}
