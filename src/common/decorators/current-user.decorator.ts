/**
 * @CurrentUser() Parameter Decorator
 *
 * Extracts the authenticated user from the request object.
 * Works with JwtAuthGuard which attaches user to request.
 *
 * Usage:
 * ```ts
 * @Get('profile')
 * getProfile(@CurrentUser() user: AuthenticatedUser) {
 *   return user;
 * }
 *
 * @Get('profile/email')
 * getEmail(@CurrentUser('email') email: string) {
 *   return email;
 * }
 * ```
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * @CurrentUser(property?)
 *
 * Extracts the authenticated user from the request.
 * If a property is provided, returns only that property of the user.
 *
 * @param data - Optional property name to extract from user object
 * @param ctx - Execution context (injected by NestJS)
 *
 * @example
 * ```ts
 * // Get full user object
 * @CurrentUser() user: AuthenticatedUser
 *
 * // Get specific property
 * @CurrentUser('id') userId: string
 * @CurrentUser('email') email: string
 * @CurrentUser('roles') roles: string[]
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
