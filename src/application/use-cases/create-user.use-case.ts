import { Inject, Injectable } from '@nestjs/common';
import {
  Email,
  Password,
  UserDomainService,
  EmailAlreadyExistsException,
  DomainException,
} from '@domain/index';
import { UnitOfWork, UNIT_OF_WORK } from '../ports/unit-of-work.port';
import { CreateUserDto } from '../dto/create-user.dto';
import { UserResponseDto } from '../dto/user-response.dto';
import { UserMapper } from '../mappers/user.mapper';
import { Audit, type RequestContext } from '../decorators/audit.decorator';
import { ValidateInput } from '../decorators/validate.decorator';
import { Result, type DomainError } from '../result';

/**
 * CreateUserUseCase — Orchestrates the user registration flow.
 *
 * This is the ONLY place where the steps of user creation are sequenced.
 * Business rules (email format, password complexity, status lifecycle)
 * live in the domain. This use case just wires things together.
 *
 * Flow:
 *   1. Validate input (via @ValidateInput decorator)
 *   2. Create value objects (Email, Password) — domain validates
 *   3. Delegate to UserDomainService for registration
 *   4. Wrap in transaction via Unit of Work
 *   5. Return UserDTO
 *
 * Error handling: Catches domain exceptions and converts to Result<T, DomainError>.
 * Never lets exceptions escape — all failures are explicit in the return type.
 */
@Injectable()
export class CreateUserUseCase {
  constructor(
    private readonly userDomainService: UserDomainService,
    @Inject(UNIT_OF_WORK)
    private readonly uow: UnitOfWork,
  ) {}

  @Audit({ action: 'user.create', resource: 'User', includePayload: true })
  @ValidateInput({ dtoClass: CreateUserDto })
  async execute(
    dto: CreateUserDto,
    context?: RequestContext,
  ): Promise<Result<UserResponseDto, DomainError>> {
    try {
      // ── Step 1: Create value objects (domain validates) ──
      let email: InstanceType<typeof Email>;
      let rawPassword: InstanceType<typeof Password>;

      try {
        email = Email.create(dto.email);
        rawPassword = Password.create(dto.password);
      } catch (error) {
        if (error instanceof Error) {
          return Result.fail({
            code: 'VALIDATION_ERROR',
            message: error.message,
          });
        }
        throw error;
      }

      // ── Step 2: Register via domain service within transaction ──
      const user = await this.uow.execute(() =>
        this.userDomainService.registerUser({
          email,
          rawPassword,
          firstName: dto.firstName,
          lastName: dto.lastName,
        }),
      );

      // ── Step 3: Return DTO ──
      return Result.ok(UserMapper.toDTO(user));
    } catch (error) {
      // ── Error mapping: domain exceptions → Result.fail ──
      if (error instanceof EmailAlreadyExistsException) {
        return Result.fail({
          code: error.code,
          message: error.message,
          details: error.metadata,
        });
      }

      if (error instanceof DomainException) {
        return Result.fail({
          code: error.code,
          message: error.message,
          details: error.metadata,
        });
      }

      // Unexpected errors — rethrow (infrastructure layer handles)
      throw error;
    }
  }
}
