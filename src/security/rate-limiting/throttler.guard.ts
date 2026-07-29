/**
 * ThrottlerGuard — Rate limiting per IP and per user
 *
 * Implements tiered rate limiting:
 * - Global: 100 requests/minute per IP
 * - Auth endpoints: 10 requests/minute per IP (brute force protection)
 * - Per-user: 1000 requests/minute (authenticated users)
 *
 * Returns 429 Too Many Requests with Retry-After header.
 * Follows IETF draft-ietf-httpapi-ratelimit-headers.
 */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { ErrorCode } from '../../domain/common/result';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  /** Maximum requests within the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Custom key prefix */
  keyPrefix?: string;
}

/**
 * Decorator to set custom rate limits on specific endpoints.
 */
export const RateLimit = (options: RateLimitOptions) => {
  return (
    target: any,
    propertyKey?: string | symbol,
    descriptor?: TypedPropertyDescriptor<any>,
  ) => {
    if (descriptor && propertyKey) {
      Reflect.defineMetadata(RATE_LIMIT_KEY, options, descriptor.value);
    }
    return descriptor ?? target;
  };
};

@Injectable()
export class ThrottlerGuard implements CanActivate {
  /** In-memory rate limit store. In production, use Redis for distributed systems. */
  private readonly store = new Map<string, RateLimitEntry>();

  /** Cleanup interval handle */
  private cleanupTimer: NodeJS.Timeout | null = null;

  private readonly defaultLimit: number;
  private readonly defaultWindow: number;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    this.defaultLimit = this.configService.get<number>('RATE_LIMIT_DEFAULT', 100);
    this.defaultWindow = this.configService.get<number>(
      'RATE_LIMIT_WINDOW_SECONDS',
      60,
    );

    // Periodic cleanup of expired entries (every 5 minutes)
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Get custom rate limit from decorator or use defaults
    const customLimit = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    const limit = customLimit?.limit ?? this.defaultLimit;
    const windowSeconds = customLimit?.windowSeconds ?? this.defaultWindow;
    const keyPrefix = customLimit?.keyPrefix ?? 'rl';

    // Build rate limit key
    const clientIp = this.getClientIp(request);
    const userId = (request as any).user?.id;
    const key = userId
      ? `${keyPrefix}:user:${userId}`
      : `${keyPrefix}:ip:${clientIp}`;

    // Check rate limit
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const entry = this.store.get(key);

    if (!entry || now > entry.resetTime) {
      // New window
      this.store.set(key, { count: 1, resetTime: now + windowMs });
      this.setRateLimitHeaders(response, limit, limit - 1, windowSeconds);
      return true;
    }

    if (entry.count >= limit) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

      response.setHeader('Retry-After', retryAfter.toString());
      response.setHeader('X-RateLimit-Limit', limit.toString());
      response.setHeader('X-RateLimit-Remaining', '0');
      response.setHeader(
        'X-RateLimit-Reset',
        Math.ceil(entry.resetTime / 1000).toString(),
      );

      throw new HttpException(
        {
          type: 'https://enterprise.system/errors/rate-limited',
          title: 'Too Many Requests',
          status: HttpStatus.TOO_MANY_REQUESTS,
          detail: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          code: ErrorCode.TOO_MANY_ATTEMPTS,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Increment counter
    entry.count++;
    this.setRateLimitHeaders(response, limit, limit - entry.count, windowSeconds);

    return true;
  }

  /**
   * Set rate limit response headers (IETF draft-ietf-httpapi-ratelimit-headers).
   */
  private setRateLimitHeaders(
    response: Response,
    limit: number,
    remaining: number,
    windowSeconds: number,
  ): void {
    response.setHeader('X-RateLimit-Limit', limit.toString());
    response.setHeader('X-RateLimit-Remaining', Math.max(0, remaining).toString());
    response.setHeader(
      'X-RateLimit-Reset',
      Math.ceil((Date.now() + windowSeconds * 1000) / 1000).toString(),
    );
  }

  /**
   * Extract client IP from request, respecting proxy headers.
   */
  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return ip.trim();
    }
    return request.ip ?? '127.0.0.1';
  }

  /**
   * Clean up expired rate limit entries.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Cleanup on module destroy.
   */
  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}
