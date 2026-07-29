import { BaseCommand } from './base.command';
import type { Result, DomainError } from '../result';
import type { UserResponseDto } from '../dto/user-response.dto';
import type { RequestContext } from '../decorators/audit.decorator';

/**
 * CreateUserCommand — Request to register a new user.
 *
 * Carries all required data for user creation.
 * The handler orchestrates: validation → uniqueness check →
 * password hashing → aggregate creation → persistence → event publishing.
 */
export class CreateUserCommand extends BaseCommand {
  readonly commandName = 'CreateUser';

  constructor(
    public readonly email: string,
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly password: string,
    public readonly context?: RequestContext,
  ) {
    super({ correlationId: context?.correlationId });
  }
}

/**
 * CreateUserCommandHandler — Orchestrates user creation.
 *
 * Responsibilities:
 * 1. Validate email uniqueness via repository
 * 2. Hash the password via the password hasher port
 * 3. Create the User aggregate (domain validates business rules)
 * 4. Persist via Unit of Work (transactional)
 * 5. Publish domain events
 * 6. Return Result<UserDTO>
 *
 * This handler contains ZERO business logic — it's pure orchestration.
 */
export interface CreateUserCommandHandler {
  execute(command: CreateUserCommand): Promise<Result<UserResponseDto, DomainError>>;
}
