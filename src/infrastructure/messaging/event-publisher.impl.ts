/**
 * Event Publisher Implementation
 *
 * Implements the EventPublisher port from the domain layer.
 * Publishes domain events to a BullMQ durable queue for async processing.
 *
 * Domain contract:
 *   publish(events: DomainEvent[]): Promise<void>
 *
 * Design:
 * - Events are serialized via their toPrimitives() method
 * - Failed events go to a dead letter queue (DLQ) for manual inspection
 * - Event IDs are used for deduplication on the consumer side
 * - Publishing must not throw per the port contract — errors are logged
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import type { EventPublisher } from '@domain/ports/event-publisher.port';
import type { DomainEvent } from '@domain/domain-events/base.event';

const EVENT_QUEUE_NAME = 'domain-events';
const DLQ_NAME = 'domain-events-dlq';

@Injectable()
export class EventPublisherImpl implements EventPublisher, OnModuleDestroy {
  private readonly logger = new Logger(EventPublisherImpl.name);
  private readonly queue: Queue;
  private readonly dlq: Queue;

  constructor(private readonly config: ConfigService) {
    const redisConnection = {
      host: this.parseRedisHost(),
      port: this.parseRedisPort(),
      password: this.config.get('redis.REDIS_PASSWORD'),
      db: this.config.get('redis.REDIS_DB', 0),
      maxRetriesPerRequest: null, // Required for BullMQ
    };

    this.queue = new Queue(EVENT_QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: { age: 86400, count: 1000 }, // 24h or 1000 jobs
        removeOnFail: { age: 604800 }, // 7 days
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    });

    this.dlq = new Queue(DLQ_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
      },
    });

    // Handle failed events → move to DLQ
    this.queue.on('failed', async (job, error) => {
      if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
        this.logger.error(
          `Event ${job.data.eventName} (${job.data.eventId}) exhausted all retries. Moving to DLQ.`,
          error.stack,
        );

        await this.dlq.add('failed-event', job.data, {
          jobId: `dlq-${job.data.eventId}`,
        });
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.dlq.close();
    this.logger.log('Event publisher queues closed');
  }

  /**
   * Publish domain events to the processing queue.
   * Per the port contract, this must not throw — errors are logged and retried.
   */
  async publish(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;

    try {
      const jobs = events.map((event) => ({
        name: event.eventName,
        data: this.serialize(event),
        opts: {
          jobId: event.eventId, // Deduplication key
        },
      }));

      await this.queue.addBulk(jobs);

      this.logger.debug(
        `Published ${events.length} event(s): ${events.map((e) => e.eventName).join(', ')}`,
      );
    } catch (error) {
      // Per port contract: must not throw. Log and let retry handle it.
      this.logger.error(
        `Failed to publish ${events.length} event(s). Will be retried by BullMQ.`,
        error,
      );
    }
  }

  // ─── Internal ────────────────────────────────────────────

  private serialize(event: DomainEvent): Record<string, unknown> {
    return {
      ...event.toPrimitives(),
      _publishedAt: new Date().toISOString(),
    };
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
