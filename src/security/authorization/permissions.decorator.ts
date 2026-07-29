/**
 * @Permissions() Decorator
 *
 * Specifies fine-grained permissions required to access a route.
 * Permissions follow the 'resource:action' convention (e.g., 'users:read').
 *
 * Usage:
 *   @Permissions('users:write', 'users:delete')
 *   @Delete('users/:id')
 *   deleteUser() { ... }
 */
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
