/**
 * @Public() Decorator
 *
 * Marks a route or controller as publicly accessible,
 * bypassing JWT authentication.
 *
 * Usage:
 *   @Public()
 *   @Get('health')
 *   getHealth() { ... }
 */
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
