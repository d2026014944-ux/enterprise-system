/**
 * Security Layer — Barrel Exports
 *
 * Centralized export point for all security components.
 */

// Authentication
export { JwtStrategy, JwtPayload, AuthenticatedUser } from './authentication/jwt.strategy';
export { JwtAuthGuard } from './authentication/auth.guard';
export { AuthService, TokenPair, TokenPayload } from './authentication/auth.service';
export { Public, IS_PUBLIC_KEY } from './authentication/public.decorator';
export { AuthModule } from './authentication/auth.module';

// Authorization
export { Roles, ROLES_KEY } from './authorization/roles.decorator';
export { RolesGuard } from './authorization/roles.guard';
export { Permissions, PERMISSIONS_KEY } from './authorization/permissions.decorator';
export { PermissionsGuard } from './authorization/permissions.guard';

// Encryption
export { EncryptionService, EncryptedData } from './encryption/encryption.service';

// Rate Limiting
export {
  ThrottlerGuard,
  RateLimit,
  RateLimitOptions,
  RATE_LIMIT_KEY,
} from './rate-limiting/throttler.guard';

// Module
export { SecurityModule } from './security.module';
