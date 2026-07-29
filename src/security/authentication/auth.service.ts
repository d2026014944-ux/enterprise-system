/**
 * AuthService — Token lifecycle management
 *
 * Handles token generation, validation, revocation, and rotation.
 * Implements refresh token rotation: each refresh issues a new pair
 * and invalidates the old refresh token (one-time use).
 *
 * Security measures:
 * - Access tokens: short-lived (15 min), HS256 signed
 * - Refresh tokens: long-lived (7 days), stored in DB, one-time use
 * - Token revocation: immediate via session table
 * - Token rotation: old refresh token invalidated on use
 * - Cryptographically random jti (JWT ID) for each token
 */
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ErrorCode, createError } from '../../domain/common/result';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TokenPayload {
  sub: string;
  email: string;
  roles: string[];
  jti: string;
}

@Injectable()
export class AuthService {
  private readonly accessTokenTtl: number;
  private readonly refreshTokenTtlDays: number;
  private readonly refreshTokenSecret: string;
  private readonly bcryptRounds: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.accessTokenTtl = this.configService.get<number>(
      'JWT_ACCESS_TTL_SECONDS',
      900, // 15 minutes
    );
    this.refreshTokenTtlDays = this.configService.get<number>(
      'JWT_REFRESH_TTL_DAYS',
      7,
    );
    this.refreshTokenSecret = this.configService.getOrThrow<string>(
      'JWT_REFRESH_SECRET',
    );
    this.bcryptRounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);
  }

  /**
   * Generate a new token pair for an authenticated user.
   * Creates a session in the database for refresh token tracking.
   */
  async generateTokenPair(
    userId: string,
    email: string,
    roles: string[],
    userAgent?: string,
    ipAddress?: string,
  ): Promise<TokenPair> {
    const jti = randomUUID();

    // Generate access token
    const accessToken = this.jwtService.sign(
      { sub: userId, email, roles, jti },
      {
        expiresIn: this.accessTokenTtl,
        algorithm: 'HS256',
        issuer: this.configService.get<string>('JWT_ISSUER', 'enterprise-system'),
        audience: this.configService.get<string>('JWT_AUDIENCE', 'enterprise-api'),
      },
    );

    // Generate opaque refresh token
    const refreshTokenValue = randomUUID();
    const refreshTokenHash = await bcrypt.hash(
      refreshTokenValue,
      this.bcryptRounds,
    );

    // Store session with hashed refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.refreshTokenTtlDays);

    await this.prisma.session.create({
      data: {
        userId,
        refreshToken: refreshTokenHash,
        userAgent: userAgent?.substring(0, 512),
        ipAddress,
        expiresAt,
      },
    });

    // Return the raw refresh token (client stores this; we store the hash)
    return {
      accessToken,
      refreshToken: `${userId}.${refreshTokenValue}`,
      expiresIn: this.accessTokenTtl,
    };
  }

  /**
   * Refresh token rotation:
   * 1. Validate the refresh token
   * 2. Revoke the old session
   * 3. Issue a new token pair
   */
  async refreshTokens(
    refreshToken: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<TokenPair> {
    // Parse the composite refresh token
    const [userId, tokenValue] = refreshToken.split('.');
    if (!userId || !tokenValue) {
      throw new UnauthorizedException({
        type: 'https://enterprise.system/errors/token-invalid',
        title: 'Invalid Refresh Token',
        status: 401,
        detail: 'The refresh token format is invalid.',
        code: ErrorCode.TOKEN_INVALID,
      });
    }

    // Find active sessions for this user
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    // Find the matching session by comparing the token hash
    let matchedSession: (typeof sessions)[0] | null = null;
    for (const session of sessions) {
      const isMatch = await bcrypt.compare(tokenValue, session.refreshToken);
      if (isMatch) {
        matchedSession = session;
        break;
      }
    }

    if (!matchedSession) {
      // Possible token reuse attack — revoke all sessions for this user
      await this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      throw new UnauthorizedException({
        type: 'https://enterprise.system/errors/token-revoked',
        title: 'Refresh Token Revoked',
        status: 401,
        detail:
          'This refresh token has been revoked due to suspicious activity. Please log in again.',
        code: ErrorCode.REFRESH_TOKEN_REVOKED,
      });
    }

    // Revoke the old session (rotation)
    await this.prisma.session.update({
      where: { id: matchedSession.id },
      data: { revokedAt: new Date() },
    });

    // Load user for new token generation
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException({
        type: 'https://enterprise.system/errors/account-inactive',
        title: 'Account Inactive',
        status: 401,
        detail: 'Your account is no longer active.',
        code: ErrorCode.USER_INACTIVE,
      });
    }

    const roles = user.roles.map((ur: any) => ur.role.name);

    // Issue new pair
    return this.generateTokenPair(userId, user.email, roles, userAgent, ipAddress);
  }

  /**
   * Revoke a specific session (logout)
   */
  async revokeToken(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const [, tokenValue] = refreshToken.split('.');
      if (tokenValue) {
        const sessions = await this.prisma.session.findMany({
          where: { userId, revokedAt: null },
        });

        for (const session of sessions) {
          const isMatch = await bcrypt.compare(tokenValue, session.refreshToken);
          if (isMatch) {
            await this.prisma.session.update({
              where: { id: session.id },
              data: { revokedAt: new Date() },
            });
            return;
          }
        }
      }
    }

    // Revoke all sessions if no specific token provided
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revoke all sessions for a user (e.g., password change, security event)
   */
  async revokeAllTokens(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Clean up expired sessions (maintenance task)
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
        revokedAt: { not: null },
      },
    });
    return result.count;
  }
}
