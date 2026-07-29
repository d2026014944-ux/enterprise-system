import { BaseCommand } from './base.command';
import type { Result, DomainError } from '../result';
import type { UserResponseDto } from '../dto/user-response.dto';
import type { RequestContext } from '../decorators/audit.decorator';

/**
 * AssignRoleCommand — Assigns a role to a user.
 *
 * Carries the target user ID, the role to assign, and
 * the identity of the grantor (for audit trail).
 */
export class AssignRoleCommand extends BaseCommand {
  readonly commandName = 'AssignRole';

  constructor(
    public readonly userId: string,
    public readonly roleId: string,
    public readonly context?: RequestContext,
  ) {
    super({ correlationId: context?.correlationId });
  }
}

/**
 * AssignRoleCommandHandler — Orchestrates role assignment.
 *
 * Responsibilities:
 * 1. Verify the role exists (via RoleRepository)
 * 2. Verify the user exists (via UserRepository)
 * 3. Verify the assignor has permission (authorization)
 * 4. Call domain method (UserAggregate.assignRole) — domain prevents duplicates
 * 5. Persist via Unit of Work
 * 6. Publish domain events
 */
export interface AssignRoleCommandHandler {
  execute(command: AssignRoleCommand): Promise<Result<UserResponseDto, DomainError>>;
}
