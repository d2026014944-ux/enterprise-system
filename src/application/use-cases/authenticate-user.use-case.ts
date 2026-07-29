import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  Email,
  User,
  UserDomainService,
  UserNotFoundException,
  UserSuspendedException,
  DomainException,
} from '@domain/index';
import { SessionRepository, SESSION_REPOSITORY } from '../ports/session.repository.port';
import {
  TokenService,
  TOKEN_SERVICE,
  type TokenPayload,
} from '../ports/token-service.port';
import { EventPublisher, EVENT_PUBLISHER } from '../ports/event-publisher.port';
import { UserAuthenticatedEvent } from '../events/user-authenticated.event';
import { Audit, type RequestContext } from '../decorators/audit.decorator';
import { Result, type DomainError } from '../result';

/**
 * Authentication response — tokens + user info.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: {
    id: string;
    email: string;
    fullName: string;
  };
}

/**
 * AuthenticateUserUseCase — Validates credentials and issues JWT tokens.
 *
 * Security considerations:
 * - Constant-time comparison for password verification (bcrypt handles this)
 * - Generic error messages to prevent user enumeration
 * - Session tracking for refresh token rotation
 *
 * Flow:
 *   1. Validate email format
 *   2. Delegate authentication to UserDomainService
 *   3. Generate access + refresh tokens
 *   4. Create session record
 *   5. Publish authentication event
 *   6. Return tokens
 */
@Injectable()
export class AuthenticateUserUseCase {
  constructor(
    private readonly userDomainService: UserDomainService,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepo: SessionRepository,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: EventPublisher,
  ) {}

  @Audit({ action: 'user.authenticate', resource: 'Session', includePayload: false })
  async execute(
    params: { email: string; password: string; userAgent?: string; ipAddress?: string },
    context?: RequestContext,
  ): Promise<Result<AuthTokens, DomainError>> {
    try {
      // ── Step 1: Create email value object ──
      let email: InstanceType<typeof Email>;
      try {
        email = Email.create(params.email);
      } catch {
        // Don't reveal whether email format is valid vs. not found
        return Result.fail({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        });
      }

      // ── Step 2: Authenticate via domain service ──
      const user = await this.userDomainService.authenticate(email, params.password);

      if (!user) {
        return Result.fail({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        });
      }

      // ── Step 3: Generate tokens ──
      const accessToken = this.tokenService.generateAccessToken({
        sub: user.id.toString(),
        email: user.email.value,
        roles: [],
      } satisfies Partial<TokenPayload>);

      const refreshToken = this.tokenService.generateRefreshToken();

      // ── Step 4: Create session ──
      const sessionId = uuidv4();
      const expiresAt = new Date(Date.now() + this.tokenService.getRefreshTokenTtl() * 1000);

      await this.sessionRepo.create({
        userId: user.id.toString(),
        refreshToken,
        userAgent: params.userAgent ?? null,
        ipAddress: params.ipAddress ?? null,
        expiresAt,
      });

      // ── Step 5: Publish event ──
      const authEvent = new UserAuthenticatedEvent(
        user.id.toString(),
        sessionId,
        params.ipAddress,
        params.userAgent,
      );
      await this.eventPublisher.publish([authEvent]).catch((err: unknown) => {
        console.error('Failed to publish authentication event:', err);
      });

      // ── Step 6: Return tokens ──
      return Result.ok({
        accessToken,
        refreshToken,
        expiresIn: this.tokenService.getAccessTokenTtl(),
        tokenType: 'Bearer',
        user: {
          id: user.id.toString(),
          email: user.email.value,
          fullName: user.fullName,
        },
      });
    } catch (error) {
      if (error instanceof UserSuspendedException) {
        return Result.fail({
          code: error.code,
          message: 'This account has been suspended. Please contact support.',
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

      throw error;
    }
  }
}
