import type { DomainEvent } from '../domain-events/base.event';

/**
 * Port (Interface) for publishing domain events.
 *
 * Decouples the domain from the messaging infrastructure.
 * Implementations may publish to:
 * - In-memory event bus (for testing / single-process)
 * - RabbitMQ / Kafka / SQS (for distributed systems)
 * - Outbox table (for transactional outbox pattern)
 */
export interface EventPublisher {
  /**
   * Publish a batch of domain events.
   * Implementations should handle serialization and routing.
   * Must not throw — event publishing failures should be logged
   * and retried by the infrastructure layer.
   */
  publish(events: DomainEvent[]): Promise<void>;
}
