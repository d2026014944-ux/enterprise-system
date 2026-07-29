import { UniqueId } from '../value-objects/unique-id.vo';

/**
 * Abstract base class for all Domain Events.
 *
 * Domain Events represent facts that happened in the domain.
 * They are immutable past creation and carry enough context
 * for event handlers to react without querying the domain.
 *
 * Design:
 * - eventId: Unique identifier for deduplication and idempotency
 * - occurredAt: Timestamp of when the event happened
 * - aggregateId: The identity of the aggregate that raised this event
 * - eventName: Discriminator for routing and serialization
 */
export abstract class DomainEvent {
  public readonly eventId: string;
  public readonly occurredAt: Date;
  public readonly aggregateId: string;
  public readonly eventName: string;

  protected constructor(
    aggregateId: string,
    occurredAt: Date,
    eventName?: string,
  ) {
    this.eventId = UniqueId.create().toString();
    this.aggregateId = aggregateId;
    this.occurredAt = occurredAt;
    this.eventName = eventName ?? this.constructor.name;
  }

  /**
   * Serialize this event to a plain object for persistence or transport.
   * Subclasses should override to include their specific payload.
   */
  toPrimitives(): Record<string, unknown> {
    return {
      eventId: this.eventId,
      aggregateId: this.aggregateId,
      occurredAt: this.occurredAt.toISOString(),
      eventName: this.eventName,
    };
  }
}
