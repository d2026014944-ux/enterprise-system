import { DomainEvent } from './base.event';
import type { UserStatus } from '../entities/user.entity';

/**
 * Raised when a User's status changes (activate, suspend, deactivate, etc.).
 *
 * Carries both old and new status for:
 * - Audit trail
 * - Conditional handler logic (e.g., send different emails on suspend vs. deactivate)
 * - Event sourcing replay
 */
export class UserStatusChangedEvent extends DomainEvent {
  public readonly oldStatus: UserStatus;
  public readonly newStatus: UserStatus;

  constructor(
    aggregateId: string,
    oldStatus: UserStatus,
    newStatus: UserStatus,
    occurredAt: Date,
  ) {
    super(aggregateId, occurredAt, 'UserStatusChanged');
    this.oldStatus = oldStatus;
    this.newStatus = newStatus;
  }

  override toPrimitives(): Record<string, unknown> {
    return {
      ...super.toPrimitives(),
      oldStatus: this.oldStatus,
      newStatus: this.newStatus,
    };
  }

  /**
   * Reconstruct from a persisted / transported primitive representation.
   */
  static fromPrimitives(
    data: Record<string, unknown>,
  ): UserStatusChangedEvent {
    return new UserStatusChangedEvent(
      data.aggregateId as string,
      data.oldStatus as UserStatus,
      data.newStatus as UserStatus,
      new Date(data.occurredAt as string),
    );
  }
}
