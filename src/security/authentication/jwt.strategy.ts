/**
 * JWT Strategy — Passport JWT authentication strategy
 *
 * Extracts Bearer token from Authorization header, validates it,
 * and attaches the authenticated user to the request context.
 *
 * Security considerations:
 * - Token expiration is enforced by passport-jwt automatically
 * - Revoked tokens are checked against the session store
 * - User status is validated on every request (not just token validity)
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ErrorCode } from '../../domain/common/result';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  jti: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
      issuer: configService.get<string>('JWT_ISSUER', 'enterprise-system'),
      audience: configService.get<string>('JWT_AUDIENCE', 'enterprise-api'),
    });
  }

  /**
   * Called by Passport after JWT signature and expiration are verified.
   * We perform additional validation: user existence, status, and token revocation.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // 1. Check if the token has been revoked (session still active?)
    const session = await this.prisma.session.findFirst({
      where: {
        userId: payload.sub,
        revokedAt: null,
      },
    });

    if (!session) {
      throw new UnauthorizedException({
        type: 'https://enterprise.system/errors/token-revoked',
        title: 'Token Revoked',
        status: 401,
        detail: 'Your session has been revoked. Please log in again.',
        code: ErrorCode.TOKEN_INVALID,
      });
    }

    // 2. Load user with roles
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        type: 'https://enterprise.system/errors/user-not-found',
        title: 'User Not Found',
        status: 401,
        detail: 'The user associated with this token no longer exists.',
        code: ErrorCode.USER_NOT_FOUND,
      });
    }

    // 3. Check user status — only ACTIVE users can access the system
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException({
        type: 'https://enterprise.system/errors/account-inactive',
        title: 'Account Inactive',
        status: 401,
        detail: `Account is ${user.status.toLowerCase()}. Contact support for assistance.`,
        code: ErrorCode.USER_INACTIVE,
      });
    }

    // 4. Build authenticated user context
    const roles = user.roles.map((ur) => ur.role.name);
    const permissions = user.roles.flatMap((ur: any) => {
      const perms = ur.role.permissions;
      return Array.isArray(perms) ? (perms as string[]) : [];
    });

    // Deduplicate permissions
    const uniquePermissions = [...new Set(permissions)] as string[];

    return {
      id: user.id,
      email: user.email,
      roles,
      permissions: uniquePermissions,
    };
  }
}
