/**
 * Presentation Module — Root presentation module
 *
 * Registers all controllers, middleware, interceptors, guards, pipes, and filters.
 * Applies global configuration for consistent API behavior.
 */
import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { SecurityModule } from '../security/security.module';
import { PrismaService } from '../infrastructure/database/prisma.service';

// Controllers
import { AuthController } from './rest/controllers/auth.controller';
import { UserController } from './rest/controllers/user.controller';
import { HealthController } from './rest/controllers/health.controller';

// Middleware
import { CorrelationIdMiddleware } from './rest/middleware/correlation-id.middleware';
import { CompressionMiddleware } from './rest/middleware/compression.middleware';

// Guards
import { RequestIdGuard } from './rest/guards/request-id.guard';

// Interceptors
import { LoggingInterceptor } from './rest/interceptors/logging.interceptor';
import { TransformInterceptor } from './rest/interceptors/transform.interceptor';
import { TimeoutInterceptor } from './rest/interceptors/timeout.interceptor';

// Pipes
import { createValidationPipe } from './rest/pipes/validation.pipe';

// Filters
import { HttpExceptionFilter } from './rest/filters/http-exception.filter';
import { DomainExceptionFilter } from './rest/filters/domain-exception.filter';

@Module({
  imports: [SecurityModule],
  controllers: [AuthController, UserController, HealthController],
  providers: [
    PrismaService,

    // Global validation pipe — validates and transforms all incoming DTOs
    {
      provide: APP_PIPE,
      useFactory: createValidationPipe,
    },

    // Global guards — applied to all routes (order matters)
    {
      provide: APP_GUARD,
      useClass: RequestIdGuard,
    },

    // Global interceptors — applied to all responses (order: outer → inner)
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },

    // Global exception filters — order: most specific → least specific
    {
      provide: APP_FILTER,
      useClass: DomainExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class PresentationModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Apply correlation ID middleware to all routes
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });

    // Apply compression middleware to all routes
    consumer
      .apply(CompressionMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
