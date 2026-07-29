/**
 * Infrastructure Module
 *
 * Root module for the infrastructure layer.
 * Registers all services, repositories, and adapters.
 * Provides injection tokens for domain port implementations.
 *
 * This is the ONLY module that other layers need to import
 * to access infrastructure capabilities.
 */
import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// ─── Config ───────────────────────────────────────────────
import {
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
} from './config';

// ─── Database ─────────────────────────────────────────────
import { PrismaService } from './database/prisma.service';
import { UserRepositoryImpl } from './database/repositories/user.repository.impl';
import { UnitOfWork } from './database/unit-of-work';

// ─── Cache ────────────────────────────────────────────────
import { CacheModule } from './cache/cache.module';

// ─── Messaging ────────────────────────────────────────────
import { BullMQModule, EVENT_PUBLISHER } from './messaging/bullmq.module';

// ─── Supabase ──────────────────────────────────────────────
import { SupabaseModule } from './supabase/supabase.module';
import { SupabaseService } from './supabase/supabase.service';

// ─── External Services ────────────────────────────────────
import { EmailService } from './external-services/email.service';
import { HttpClientService } from './external-services/http-client.service';

// ─── Security ─────────────────────────────────────────────
import { PasswordHasherImpl } from './security/password-hasher.impl';

// ─── Injection Tokens ─────────────────────────────────────
// These tokens allow the application layer to inject port implementations
// without depending on infrastructure internals.

/** Token for UserRepository port implementation */
export const USER_REPOSITORY = Symbol('UserRepository');

/** Token for PasswordHasher port implementation */
export const PASSWORD_HASHER = Symbol('PasswordHasher');

/** Token for UnitOfWork */
export const UNIT_OF_WORK = Symbol('UnitOfWork');

@Global()
@Module({
  imports: [
    // ── Configuration ──────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, jwtConfig],
    }),

    // ── Sub-modules ────────────────────────────────────
    CacheModule,
    BullMQModule,
    SupabaseModule,
  ],
  providers: [
    // ── Database ───────────────────────────────────────
    PrismaService,

    // ── Repository Implementations ─────────────────────
    UserRepositoryImpl,

    // ── Unit of Work ───────────────────────────────────
    UnitOfWork,

    // ── External Services ──────────────────────────────
    EmailService,
    HttpClientService,

    // ── Security ───────────────────────────────────────
    PasswordHasherImpl,

    // ── Port Bindings (Port Token → Adapter) ───────────
    {
      provide: USER_REPOSITORY,
      useExisting: UserRepositoryImpl,
    },
    {
      provide: UNIT_OF_WORK,
      useExisting: UnitOfWork,
    },
    {
      provide: PASSWORD_HASHER,
      useExisting: PasswordHasherImpl,
    },
    // EVENT_PUBLISHER is bound in BullMQModule
  ],
  exports: [
    // ── Configuration ──────────────────────────────────
    ConfigModule,

    // ── Database ───────────────────────────────────────
    PrismaService,

    // ── Port Bindings ──────────────────────────────────
    USER_REPOSITORY,
    UNIT_OF_WORK,
    PASSWORD_HASHER,
    EVENT_PUBLISHER,

    // ── Services ───────────────────────────────────────
    EmailService,
    HttpClientService,
    SupabaseService,

    // ── Sub-modules ────────────────────────────────────
    CacheModule,
    BullMQModule,
    SupabaseModule,
  ],
})
export class InfrastructureModule {}
