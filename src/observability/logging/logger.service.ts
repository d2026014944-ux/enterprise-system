/**
 * Logger Service — Structured Logging with Winston
 *
 * Production: JSON format for machine parsing (ELK, Datadog, etc.)
 * Development: Colorized human-readable format
 *
 * Features:
 * - Context binding (requestId, userId, correlationId)
 * - Sensitive field redaction (passwords, tokens, PII)
 * - Lazy evaluation for expensive log messages
 * - Log levels: error, warn, info, http, debug
 *
 * Reference: Google SRE Book — "Structured Logging" chapter
 */

import { Injectable, LoggerService as NestLoggerService, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';

/** Fields that must be redacted from log output. */
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
  'ssn',
  'cvv',
  'pin',
]);

/** Context bound to every log entry. */
export interface LogContext {
  requestId?: string;
  userId?: string;
  correlationId?: string;
  tenantId?: string;
  [key: string]: string | undefined;
}

/** Lazy message supplier — called only if the log level is enabled. */
type LazyMessage = () => string | Record<string, unknown>;

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService implements NestLoggerService {
  private logger: winston.Logger;
  private context: LogContext = {};
  private childLogger?: winston.Logger;

  constructor(private readonly configService: ConfigService) {
    const level = this.configService.get<string>('LOG_LEVEL', 'info');
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    this.logger = winston.createLogger({
      level,
      levels: { error: 0, warn: 1, info: 2, http: 3, debug: 4 },
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
      ),
      defaultMeta: { service: 'enterprise-system' },
      transports: this.createTransports(nodeEnv),
    });

    // Add custom colors
    winston.addColors({
      error: 'red',
      warn: 'yellow',
      info: 'green',
      http: 'magenta',
      debug: 'cyan',
    });
  }

  private createTransports(nodeEnv: string): winston.transport[] {
    const transports: winston.transport[] = [];

    if (nodeEnv === 'production') {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.json(),
          ),
        }),
      );
    } else {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize({ all: true }),
            winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
              const ctx = context ? `[${context}]` : '';
              const extra = Object.keys(meta).length > 0
                ? ` ${JSON.stringify(meta)}`
                : '';
              return `${timestamp} ${level} ${ctx} ${message}${extra}`;
            }),
          ),
        }),
      );
    }

    return transports;
  }

  /**
   * Bind context fields to this logger instance.
   * All subsequent log calls will include these fields.
   */
  setContext(context: LogContext): this {
    this.context = { ...this.context, ...context };
    return this;
  }

  /**
   * Create a child logger with additional context.
   * Useful for request-scoped logging.
   */
  child(context: LogContext): LoggerService {
    const childLogger = Object.create(this) as LoggerService;
    childLogger.context = { ...this.context, ...context };
    childLogger.logger = this.logger.child(this.redact(context));
    return childLogger;
  }

  // ─── NestJS LoggerService interface ───

  log(message: string | LazyMessage, context?: string): void {
    this.write('info', message, context);
  }

  error(message: string | LazyMessage, trace?: string, context?: string): void {
    const resolved = this.resolveMessage(message);
    const meta: Record<string, unknown> = {};
    if (trace) meta.stack = trace;
    this.logger.error(resolved, { context: context || this.getContextString(), ...this.redact(meta) });
  }

  warn(message: string | LazyMessage, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: string | LazyMessage, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: string | LazyMessage, context?: string): void {
    this.write('debug', message, context);
  }

  // ─── Extended methods ───

  http(message: string | LazyMessage, meta?: Record<string, unknown>): void {
    const resolved = this.resolveMessage(message);
    this.logger.http(resolved, { context: this.getContextString(), ...this.redact(meta || {}), ...this.context });
  }

  /**
   * Log with structured metadata.
   * The message supplier is only called if the level is enabled (lazy evaluation).
   */
  logWithMeta(
    level: 'error' | 'warn' | 'info' | 'http' | 'debug',
    messageSupplier: string | LazyMessage,
    meta: Record<string, unknown>,
  ): void {
    if (!this.logger.is(level, this.logger.level)) return;
    const resolved = this.resolveMessage(messageSupplier);
    this.logger.log(level, resolved, {
      context: this.getContextString(),
      ...this.redact(meta),
      ...this.context,
    });
  }

  /**
   * Check if a log level is enabled.
   * Useful for guarding expensive message construction.
   */
  isLevelEnabled(level: string): boolean {
    return this.logger.is(level, this.logger.level);
  }

  // ─── Private helpers ───

  private write(level: string, message: string | LazyMessage, context?: string): void {
    if (!this.logger.is(level, this.logger.level)) return;
    const resolved = this.resolveMessage(message);
    this.logger.log(level, resolved, { context: context || this.getContextString(), ...this.context });
  }

  private resolveMessage(message: string | LazyMessage): string {
    if (typeof message === 'function') {
      const result = message();
      return typeof result === 'string' ? result : JSON.stringify(result);
    }
    return message;
  }

  private getContextString(): string {
    return this.context.requestId
      ? `req:${this.context.requestId}`
      : 'application';
  }

  /**
   * Deep-redact sensitive fields from an object.
   * Performs a single traversal — O(n) where n = total keys.
   */
  redact<T>(obj: T): T {
    if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((item) => this.redact(item)) as T;

    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_FIELDS.has(key)) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = this.redact(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted as T;
  }
}
