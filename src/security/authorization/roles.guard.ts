/**
 * RolesGuard — Role-based access control (RBAC)
 *
 * Checks if the authenticated user has at least one of the required roles.
 * Reads required roles from the @Roles() decorator metadata.
 *
 * Returns RFC 7807 Problem Details on authorization failure.
 */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { ErrorCode } from '../../domain/common/result';
import { AuthenticatedUser } from '../authentication/jwt.strategy';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No roles required — allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new ForbiddenException({
        type: 'https://enterprise.system/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication required.',
        code: ErrorCode.INVALID_CREDENTIALS,
      });
    }

    const hasRole = requiredRoles.some((role) => user.roles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException({
        type: 'https://enterprise.system/errors/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: `This action requires one of the following roles: ${requiredRoles.join(', ')}.`,
        code: ErrorCode.FORBIDDEN,
        requiredRoles,
        userRoles: user.roles,
      });
    }

    return true;
  }
}
