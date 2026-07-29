/**
 * Application Root Module
 *
 * The root module that imports all feature modules and configures
 * global concerns (config, throttling, scheduling).
 *
 * Module Dependency Graph:
 * ```
 * AppModule
 * ├── ConfigModule (env validation)
 * ├── ScheduleModule (cron jobs)
 * ├── InfrastructureModule (database, cache, messaging)
 * ├── SecurityModule (auth, RBAC, encryption, rate limiting)
 * ├── ObservabilityModule (logging, metrics, tracing, health)
 * ├── UserModule (IAM bounded context)
 * └── ... (future feature modules)
 * ```
 */

import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

// ─── Configuration ────────────────────────────────────────
import {
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
} from '@infrastructure/config';

// ─── Feature Modules ──────────────────────────────────────
import { InfrastructureModule } from '@infrastructure/infrastructure.module';
import { SecurityModule } from '@security/security.module';
import { ObservabilityModule } from '@observability/index';

// ─── Middleware ────────────────────────────────────────────
import { RequestLoggerMiddleware } from '@observability/logging/request-logger.middleware';

@Module({
  imports: [
    // ── Configuration ──────────────────────────────────
    // Loaded first. All other modules depend on ConfigService.
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, jwtConfig],
      envFilePath: ['.env.local', '.env'],
      cache: true, // Cache parsed config (read once)
      expandVariables: true, // Support ${VAR} syntax
    }),

    // ── Scheduling ─────────────────────────────────────
    // Provides @Cron(), @Interval(), @Timeout() decorators.
    ScheduleModule.forRoot(),

    // ── Infrastructure (Database, Cache, Messaging) ────
    InfrastructureModule,

    // ── Security (Auth, RBAC, Encryption, Rate Limiting) ──
    SecurityModule,

    // ── Observability (Logging, Metrics, Tracing, Health) ──
    ObservabilityModule,

    // ── Feature Modules ────────────────────────────────
    // Import feature modules here as they are created.
    // Example: UserModule, TenantModule, NotificationModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Apply request logger middleware to all routes
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
