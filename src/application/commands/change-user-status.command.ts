import { BaseCommand } from './base.command';
import type { Result, DomainError } from '../result';
import type { UserResponseDto } from '../dto/user-response.dto';
import type { UserStatus } from '@domain/index';
import type { RequestContext } from '../decorators/audit.decorator';

/**
 * ChangeUserStatusCommand — Transitions a user's account status.
 *
 * The domain enforces valid state transitions (e.g., you cannot
 * transition from SUSPENDED to PENDING_VERIFICATION).
 */
export class ChangeUserStatusCommand extends BaseCommand {
  readonly commandName = 'ChangeUserStatus';

  constructor(
    public readonly userId: string,
    public readonly newStatus: UserStatus,
    public readonly context?: RequestContext,
  ) {
    super({ correlationId: context?.correlationId });
  }
}

/**
 * ChangeUserStatusCommandHandler — Orchestrates status transitions.
 *
 * Responsibilities:
 * 1. Load User aggregate from repository
 * 2. Call domain method (activate/suspend/deactivate) — domain enforces rules
 * 3. Persist the updated aggregate
 * 4. Publish domain events
 */
export interface ChangeUserStatusCommandHandler {
  execute(command: ChangeUserStatusCommand): Promise<Result<UserResponseDto, DomainError>>;
}
