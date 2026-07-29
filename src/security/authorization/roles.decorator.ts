/**
 * @Roles() Decorator
 *
 * Specifies which roles are required to access a route or controller.
 * Used in conjunction with RolesGuard.
 *
 * Usage:
 *   @Roles('admin', 'manager')
 *   @Delete('users/:id')
 *   deleteUser() { ... }
 */
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
