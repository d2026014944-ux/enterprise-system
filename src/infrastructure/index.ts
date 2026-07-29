/**
 * Infrastructure Layer - Public API
 *
 * Barrel export for the infrastructure layer.
 * Other layers import from here — they never reach into internal files.
 */

// ─── Module & Injection Tokens ────────────────────────────
export {
  InfrastructureModule,
  USER_REPOSITORY,
  PASSWORD_HASHER,
  UNIT_OF_WORK,
} from './infrastructure.module';

// ─── Config ───────────────────────────────────────────────
export {
  appConfig,
  appConfigSchema,
  type AppConfig,
  databaseConfig,
  databaseConfigSchema,
  buildPrismaUrl,
  type DatabaseConfig,
  redisConfig,
  redisConfigSchema,
  parseSentinelNodes,
  parseClusterNodes,
  type RedisConfig,
  jwtConfig,
  jwtConfigSchema,
  type JwtConfig,
} from './config';

// ─── Database ─────────────────────────────────────────────
export {
  PrismaService,
  ConcurrencyConflictError,
  DatabaseError,
} from './database/prisma.service';
export { BaseRepository } from './database/base.repository';
export { UserRepositoryImpl } from './database/repositories/user.repository.impl';
export {
  UnitOfWork,
  type TransactionalRepositories,
} from './database/unit-of-work';

// ─── Cache ────────────────────────────────────────────────
export {
  CacheService,
  Cached,
  type CacheOptions,
  type CacheStats,
} from './cache/cache.service';
export { CacheModule } from './cache/cache.module';

// ─── Messaging ────────────────────────────────────────────
export { EventPublisherImpl } from './messaging/event-publisher.impl';
export {
  EventProcessorService,
  type EventHandler,
} from './messaging/event-processor.service';
export { BullMQModule, EVENT_PUBLISHER } from './messaging/bullmq.module';

// ─── External Services ────────────────────────────────────
export {
  EmailService,
  type SendEmailParams,
  type EmailResult,
} from './external-services/email.service';
export {
  HttpClientService,
  type HttpClientOptions,
} from './external-services/http-client.service';

// ─── Security ─────────────────────────────────────────────
export { PasswordHasherImpl } from './security/password-hasher.impl';

// ─── Supabase ─────────────────────────────────────────────
export { SupabaseService } from './supabase/supabase.service';
export { SupabaseModule } from './supabase/supabase.module';
