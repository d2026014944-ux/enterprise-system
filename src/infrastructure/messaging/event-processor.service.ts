/**
 * Event Processor Service
 *
 * Processes domain events from the BullMQ queue.
 * Features:
 * - Idempotent processing (deduplication via event ID)
 * - Retry with exponential backoff (BullMQ built-in)
 * - Structured logging for observability
 * - Graceful shutdown
 *
 * Consumers register handlers for specific event names.
 * Unhandled events are logged and acknowledged (no-op).
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { CacheService } from '../cache/cache.service';

const EVENT_QUEUE_NAME = 'domain-events';
const DEDUP_PREFIX = 'event-processed:';
const DEDUP_TTL_SECONDS = 86400; // 24 hours

export type EventHandler = (
  payload: Record<string, unknown>,
  job: Job,
) => Promise<void>;

@Injectable()
export class EventProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventProcessorService.name);
  private readonly handlers = new Map<string, EventHandler[]>();
  private worker: Worker | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker(
      EVENT_QUEUE_NAME,
      (job) => this.processEvent(job),
      {
        connection: {
          host: this.parseRedisHost(),
          port: this.parseRedisPort(),
          password: this.config.get('redis.REDIS_PASSWORD'),
          db: this.config.get('redis.REDIS_DB', 0),
          maxRetriesPerRequest: null,
        },
        concurrency: 5,
        limiter: {
          max: 100,
          duration: 1000, // 100 events/second max
        },
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.debug(
        `Event processed: ${job.data.eventName} (${job.data.eventId})`,
      );
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Event processing failed: ${job?.data.eventName} (${job?.data.eventId})`,
        error.stack,
      );
    });

    this.logger.log('Event processor started');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.logger.log('Event processor stopped');
    }
  }

  /**
   * Register a handler for a specific event name.
   * Multiple handlers can be registered for the same event.
   */
  registerHandler(eventName: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventName) ?? [];
    existing.push(handler);
    this.handlers.set(eventName, existing);
    this.logger.debug(`Registered handler for event: ${eventName}`);
  }

  /**
   * Process a single event job.
   * Implements idempotency — if an event was already processed, skip it.
   */
  private async processEvent(job: Job): Promise<void> {
    const { eventId, eventName, ...payload } = job.data;

    // ── Idempotency check ──────────────────────────────
    const alreadyProcessed = await this.isAlreadyProcessed(eventId);
    if (alreadyProcessed) {
      this.logger.debug(`Skipping already-processed event: ${eventId}`);
      return;
    }

    // ── Find handlers ──────────────────────────────────
    const handlers = this.handlers.get(eventName);
    if (!handlers || handlers.length === 0) {
      this.logger.warn(`No handler registered for event: ${eventName}`);
      return; // Acknowledge — no point retrying without a handler
    }

    // ── Execute handlers ───────────────────────────────
    for (const handler of handlers) {
      try {
        await handler(payload, job);
      } catch (error) {
        this.logger.error(
          `Handler failed for event ${eventName} (${eventId})`,
          error,
        );
        throw error; // Re-throw to trigger BullMQ retry
      }
    }

    // ── Mark as processed ──────────────────────────────
    await this.markProcessed(eventId);
  }

  /**
   * Check if an event has already been processed (deduplication).
   */
  private async isAlreadyProcessed(eventId: string): Promise<boolean> {
    try {
      return await this.cache.has(`${DEDUP_PREFIX}${eventId}`);
    } catch {
      // If cache is down, allow processing (better duplicate than lost)
      return false;
    }
  }

  /**
   * Mark an event as processed.
   */
  private async markProcessed(eventId: string): Promise<void> {
    try {
      await this.cache.set(`${DEDUP_PREFIX}${eventId}`, '1', {
        ttl: DEDUP_TTL_SECONDS,
      });
    } catch (error) {
      // Non-critical — worst case we process the event again
      this.logger.warn(`Failed to mark event as processed: ${eventId}`);
    }
  }

  private parseRedisHost(): string {
    const url = this.config.get('redis.REDIS_URL', 'redis://localhost:6379');
    try {
      return new URL(url).hostname;
    } catch {
      return 'localhost';
    }
  }

  private parseRedisPort(): number {
    const url = this.config.get('redis.REDIS_URL', 'redis://localhost:6379');
    try {
      return Number(new URL(url).port) || 6379;
    } catch {
      return 6379;
    }
  }
}
