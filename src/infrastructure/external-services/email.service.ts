/**
 * Email Service
 *
 * Abstraction over email delivery providers (SendGrid, SES, SMTP).
 * Supports templates, retry logic, and rate limiting.
 *
 * Design:
 * - Provider-agnostic interface — swap implementations without changing consumers
 * - Template-based emails with variable interpolation
 * - Exponential backoff retry for transient failures
 * - Token bucket rate limiting to respect provider limits
 * - Structured logging for deliverability tracking
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalServiceError } from '@domain/exceptions';

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  templateId?: string;
  html?: string;
  text?: string;
  variables?: Record<string, string>;
  from?: string;
  replyTo?: string;
  tags?: string[];
}

export interface EmailResult {
  messageId: string;
  status: 'sent' | 'queued' | 'failed';
}

interface RateLimiterState {
  tokens: number;
  lastRefill: number;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly maxRetries: number;
  private readonly rateLimiter: RateLimiterState;
  private readonly rateLimit: number;
  private readonly rateLimitWindowMs: number;

  constructor(private readonly config: ConfigService) {
    this.maxRetries = 3;
    this.rateLimit = 100; // emails per window
    this.rateLimitWindowMs = 60_000; // 1 minute window
    this.rateLimiter = {
      tokens: this.rateLimit,
      lastRefill: Date.now(),
    };
  }

  /**
   * Send an email with retry logic and rate limiting.
   */
  async send(params: SendEmailParams): Promise<EmailResult> {
    // ── Rate limiting ────────────────────────────────────
    this.refillTokens();
    if (this.rateLimiter.tokens <= 0) {
      throw new ExternalServiceError(
        'EmailService',
        'Rate limit exceeded. Try again later.',
      );
    }
    this.rateLimiter.tokens--;

    // ── Validate ────────────────────────────────────────
    this.validateParams(params);

    // ── Retry with exponential backoff ───────────────────
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.doSend(params);
        this.logger.log(
          `Email sent to ${Array.isArray(params.to) ? params.to.join(', ') : params.to} ` +
            `(messageId: ${result.messageId})`,
        );
        return result;
      } catch (error) {
        lastError = error as Error;

        if (!this.isRetryable(error)) {
          this.logger.error(
            `Non-retryable email error on attempt ${attempt}`,
            error,
          );
          throw new ExternalServiceError('EmailService', lastError.message, {
            cause: error,
          });
        }

        if (attempt < this.maxRetries) {
          const delay = this.calculateBackoff(attempt);
          this.logger.warn(
            `Email send failed (attempt ${attempt}/${this.maxRetries}). Retrying in ${delay}ms...`,
          );
          await this.sleep(delay);
        }
      }
    }

    this.logger.error(
      `Email send failed after ${this.maxRetries} attempts`,
      lastError,
    );
    throw new ExternalServiceError(
      'EmailService',
      `Failed to send email after ${this.maxRetries} attempts: ${lastError?.message}`,
      { cause: lastError },
    );
  }

  /**
   * Send a templated email.
   */
  async sendTemplate(
    to: string | string[],
    templateId: string,
    variables: Record<string, string>,
    options?: Partial<SendEmailParams>,
  ): Promise<EmailResult> {
    return this.send({
      to,
      subject: options?.subject ?? 'Notification',
      templateId,
      variables,
      ...options,
    });
  }

  // ─── Internal ────────────────────────────────────────────

  /**
   * Actual email sending logic.
   * In production, this would integrate with SendGrid/SES/SMTP.
   * Currently logs the email for development/testing.
   */
  private async doSend(params: SendEmailParams): Promise<EmailResult> {
    // Simulate provider latency
    await this.sleep(50);

    // In production, replace with actual provider integration:
    //
    // SendGrid:
    //   await this.sendgrid.send({ to, from, subject, html, ... });
    //
    // AWS SES:
    //   await this.ses.sendEmail({ Destination, Message, ... }).promise();
    //
    // SMTP:
    //   await this.transporter.sendMail({ to, from, subject, html });

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.logger.debug(`[MOCK] Email sent: ${JSON.stringify({
      to: params.to,
      subject: params.subject,
      templateId: params.templateId,
      messageId,
    })}`);

    return { messageId, status: 'sent' };
  }

  private validateParams(params: SendEmailParams): void {
    if (!params.to || (Array.isArray(params.to) && params.to.length === 0)) {
      throw new Error('Email recipient is required');
    }

    if (!params.subject) {
      throw new Error('Email subject is required');
    }

    if (!params.html && !params.text && !params.templateId) {
      throw new Error('Email must have html, text, or templateId');
    }
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // Network errors, timeouts, 5xx — retryable
      if (
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('econnreset') ||
        message.includes('rate limit') ||
        message.includes('429') ||
        message.includes('500') ||
        message.includes('502') ||
        message.includes('503')
      ) {
        return true;
      }
    }
    return false;
  }

  private calculateBackoff(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s + jitter
    const base = Math.pow(2, attempt - 1) * 1000;
    const jitter = Math.random() * 500;
    return base + jitter;
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.rateLimiter.lastRefill;
    const refillRate = this.rateLimit / this.rateLimitWindowMs;
    const tokensToAdd = elapsed * refillRate;

    this.rateLimiter.tokens = Math.min(
      this.rateLimit,
      this.rateLimiter.tokens + tokensToAdd,
    );
    this.rateLimiter.lastRefill = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
