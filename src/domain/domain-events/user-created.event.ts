import { DomainEvent } from './base.event';

/**
 * Raised when a new User is created in the domain.
 *
 * Carries the essential context for downstream handlers:
 * - Send welcome / verification email
 * - Create default tenant membership
 * - Initialize user preferences
 */
export class UserCreatedEvent extends DomainEvent {
  public readonly email: string;

  constructor(
    aggregateId: string,
    email: string,
    occurredAt: Date,
  ) {
    super(aggregateId, occurredAt, 'UserCreated');
    this.email = email;
  }

  override toPrimitives(): Record<string, unknown> {
    return {
      ...super.toPrimitives(),
      email: this.email,
    };
  }

  /**
   * Reconstruct from a persisted / transported primitive representation.
   */
  static fromPrimitives(data: Record<string, unknown>): UserCreatedEvent {
    return new UserCreatedEvent(
      data.aggregateId as string,
      data.email as string,
      new Date(data.occurredAt as string),
    );
  }
}
