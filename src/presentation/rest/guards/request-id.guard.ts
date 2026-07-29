/**
 * RequestId Guard — Request identification for tracing
 *
 * Generates or extracts an X-Request-ID from the request header.
 * Unlike CorrelationId (for distributed tracing), RequestId is
 * per-request and used for log correlation and debugging.
 *
 * Also attaches the request ID to the response header.
 */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

@Injectable()
export class RequestIdGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Extract existing or generate new
    const existingId = request.headers[REQUEST_ID_HEADER] as
      | string
      | undefined;
    const requestId = existingId ?? randomUUID();

    // Attach to request
    request.requestId = requestId;

    // Set on response
    response.setHeader(REQUEST_ID_HEADER, requestId);

    return true;
  }
}
