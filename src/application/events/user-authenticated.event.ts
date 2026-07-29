import { DomainEvent } from '@domain/index';

/**
 * UserAuthenticatedEvent — Raised when a user successfully authenticates.
 *
 * This is an application-layer event (not a domain event) because
 * authentication is an application concern, not a domain invariant.
 */
export class UserAuthenticatedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly sessionId: string,
    public readonly ipAddress?: string,
    public readonly userAgent?: string,
  ) {
    super(aggregateId, new Date(), 'user.authenticated');
  }

  override toPrimitives(): Record<string, unknown> {
    return {
      ...super.toPrimitives(),
      sessionId: this.sessionId,
      ipAddress: this.ipAddress,
      userAgent: this.userAgent,
    };
  }
}
