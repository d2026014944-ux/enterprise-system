import type { DomainEvent } from '@domain/index';

/**
 * Event Publisher — Application-layer port for publishing domain events.
 *
 * This mirrors the domain port but is used by the application layer
 * to publish events after successful use case execution.
 */
export interface EventPublisher {
  publish(events: DomainEvent[]): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
