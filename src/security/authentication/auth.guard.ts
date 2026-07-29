/**
 * AuthGuard — JWT authentication guard with public route bypass
 *
 * Extends Passport's AuthGuard to support the @Public() decorator.
 * Returns RFC 7807 Problem Details on authentication failure.
 *
 * Defense in depth:
 * - JWT signature verification (Passport)
 * - Token expiration (Passport)
 * - Token revocation check (JwtStrategy)
 * - User status validation (JwtStrategy)
 */
import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ErrorCode } from '../../domain/common/result';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if the route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = any>(
    err: Error | null,
    user: TUser | false,
    info: { message?: string } | undefined,
  ): TUser {
    // Token expired
    if (info?.message === 'jwt expired') {
      throw new UnauthorizedException({
        type: 'https://enterprise.system/errors/token-expired',
        title: 'Token Expired',
        status: 401,
        detail: 'Your access token has expired. Please refresh your token.',
        code: ErrorCode.TOKEN_EXPIRED,
        instance: '/auth/refresh',
      });
    }

    // Invalid token
    if (info?.message === 'No auth token' || info?.message === 'invalid token') {
      throw new UnauthorizedException({
        type: 'https://enterprise.system/errors/token-invalid',
        title: 'Invalid Token',
        status: 401,
        detail: 'The provided authentication token is invalid.',
        code: ErrorCode.TOKEN_INVALID,
      });
    }

    // Any other error or missing user
    if (err || !user) {
      throw new UnauthorizedException({
        type: 'https://enterprise.system/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: err?.message ?? 'Authentication required to access this resource.',
        code: ErrorCode.INVALID_CREDENTIALS,
      });
    }

    return user;
  }
}
