/**
 * CorrelationId Middleware — Distributed tracing correlation
 *
 * Extracts or generates a correlation ID from the X-Correlation-ID header.
 * Attaches it to the request context for propagation to downstream services.
 *
 * The correlation ID is also set on the response header for client-side tracing.
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Extract from header or generate new
    const existingId = req.headers[CORRELATION_ID_HEADER] as string | undefined;
    const correlationId = existingId ?? randomUUID();

    // Attach to request
    req.correlationId = correlationId;

    // Set on response for client visibility
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    next();
  }
}
