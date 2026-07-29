/**
 * PermissionsGuard — Fine-grained permission checking
 *
 * Checks if the authenticated user has ALL required permissions.
 * Permissions are loaded from the user's roles (aggregated).
 *
 * Permission format: 'resource:action' (e.g., 'users:read', 'users:write')
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
import { PERMISSIONS_KEY } from './permissions.decorator';
import { ErrorCode } from '../../domain/common/result';
import { AuthenticatedUser } from '../authentication/jwt.strategy';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No permissions required — allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
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

    // Check that user has ALL required permissions
    const missingPermissions = requiredPermissions.filter(
      (permission) => !user.permissions.includes(permission),
    );

    if (missingPermissions.length > 0) {
      throw new ForbiddenException({
        type: 'https://enterprise.system/errors/insufficient-permissions',
        title: 'Insufficient Permissions',
        status: 403,
        detail: `Missing required permissions: ${missingPermissions.join(', ')}.`,
        code: ErrorCode.FORBIDDEN,
        requiredPermissions,
        missingPermissions,
      });
    }

    return true;
  }
}
