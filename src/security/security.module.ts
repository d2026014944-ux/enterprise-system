/**
 * Security Module — Root security module
 *
 * Aggregates all security concerns:
 * - Authentication (JWT, Passport)
 * - Authorization (RBAC, fine-grained permissions)
 * - Encryption (AES-256-GCM)
 * - Rate limiting
 *
 * Exports all guards, decorators, and services for use by other modules.
 */
import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './authentication/auth.module';
import { AuthService } from './authentication/auth.service';
import { JwtAuthGuard } from './authentication/auth.guard';
import { RolesGuard } from './authorization/roles.guard';
import { PermissionsGuard } from './authorization/permissions.guard';
import { EncryptionService } from './encryption/encryption.service';
import { ThrottlerGuard } from './rate-limiting/throttler.guard';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

/**
 * APP_GUARD token for registering global guards.
 * Using @nestjs/core's APP_GUARD ensures guards apply to all routes.
 */
import { APP_GUARD } from '@nestjs/core';

@Global()
@Module({
  imports: [ConfigModule, AuthModule],
  providers: [
    PrismaService,
    EncryptionService,
    ThrottlerGuard,
    // Register guards globally — order matters (outer → inner)
    // 1. JWT Auth — authenticates the request
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // 2. Roles Guard — checks role-based access
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // 3. Permissions Guard — checks fine-grained permissions
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    // 4. Rate Limiting — throttles requests
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    EncryptionService,
    ThrottlerGuard,
    AuthModule,
  ],
})
export class SecurityModule {}
