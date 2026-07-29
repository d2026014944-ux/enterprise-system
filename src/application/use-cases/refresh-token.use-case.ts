import { Inject, Injectable } from '@nestjs/common';
import {
  UniqueId,
  User,
  UserNotFoundException,
  UserSuspendedException,
  DomainException,
} from '@domain/index';
import { UserRepository, USER_REPOSITORY } from '../ports/user.repository.port';
import { SessionRepository, SESSION_REPOSITORY } from '../ports/session.repository.port';
import { TokenService, TOKEN_SERVICE } from '../ports/token-service.port';
import { EventPublisher, EVENT_PUBLISHER } from '../ports/event-publisher.port';
import { Audit, type RequestContext } from '../decorators/audit.decorator';
import { Result, type DomainError } from '../result';
import type { AuthTokens } from './authenticate-user.use-case';

/**
 * RefreshTokenUseCase — Rotates refresh tokens and issues new access tokens.
 *
 * Token Rotation (security best practice):
 *   1. Validate the provided refresh token
 *   2. Verify the session is not revoked
 *   3. Generate new access + refresh tokens
 *   4. Revoke the old refresh token
 *   5. Create a new session with the new refresh token
 *
 * If a revoked token is reused (potential theft), ALL sessions for that
 * user are terminated as a security measure.
 */
@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepo: SessionRepository,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: EventPublisher,
  ) {}

  @Audit({ action: 'session.refresh_token', resource: 'Session' })
  async execute(
    params: { refreshToken: string; userAgent?: string; ipAddress?: string },
    context?: RequestContext,
  ): Promise<Result<AuthTokens, DomainError>> {
    // ── Step 1: Find session by refresh token ──
    const session = await this.sessionRepo.findByRefreshToken(params.refreshToken);

    if (!session) {
      return Result.fail({
        code: 'TOKEN_INVALID',
        message: 'Invalid refresh token.',
      });
    }

    // ── Step 2: Check if session is revoked ──
    if (session.revokedAt) {
      // Potential token reuse attack — revoke ALL sessions for this user
      await this.sessionRepo.revokeAllForUser(session.userId);

      return Result.fail({
        code: 'REFRESH_TOKEN_REVOKED',
        message: 'This refresh token has been revoked. All sessions have been terminated for security.',
      });
    }

    // ── Step 3: Check expiration ──
    if (session.expiresAt < new Date()) {
      return Result.fail({
        code: 'TOKEN_EXPIRED',
        message: 'Refresh token has expired. Please log in again.',
      });
    }

    // ── Step 4: Load user ──
    let user: InstanceType<typeof User>;
    try {
      const userId = UniqueId.fromString(session.userId);
      user = await this.userRepo.findById(userId);
    } catch (error) {
      if (error instanceof UserNotFoundException) {
        return Result.fail({
          code: error.code,
          message: 'User associated with this token no longer exists.',
          details: error.metadata,
        });
      }
      throw error;
    }

    if (!user.isActive) {
      return Result.fail({
        code: 'USER_INACTIVE',
        message: 'This account is no longer active.',
      });
    }

    // ── Step 5: Rotate tokens ──
    // Revoke old session
    await this.sessionRepo.revoke(session.id);

    // Generate new tokens
    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id.toString(),
      email: user.email.value,
      roles: [],
    });

    const newRefreshToken = this.tokenService.generateRefreshToken();

    // Create new session
    const expiresAt = new Date(Date.now() + this.tokenService.getRefreshTokenTtl() * 1000);

    await this.sessionRepo.create({
      userId: user.id.toString(),
      refreshToken: newRefreshToken,
      userAgent: params.userAgent ?? session.userAgent,
      ipAddress: params.ipAddress ?? session.ipAddress,
      expiresAt,
    });

    // ── Step 6: Return new tokens ──
    return Result.ok({
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.tokenService.getAccessTokenTtl(),
      tokenType: 'Bearer',
      user: {
        id: user.id.toString(),
        email: user.email.value,
        fullName: user.fullName,
      },
    });
  }
}
