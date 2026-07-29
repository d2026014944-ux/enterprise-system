/**
 * Application Bootstrap — 12-Factor App Entry Point
 *
 * Configures and starts the NestJS application with all global concerns:
 * - Validation (whitelist, forbid non-whitelisted)
 * - Exception handling (global catch-all filter)
 * - Response transformation (standard envelope)
 * - Security (Helmet, CORS, rate limiting)
 * - Compression (gzip)
 * - Swagger documentation
 * - Graceful shutdown (SIGTERM/SIGINT handling)
 *
 * Reference: 12-Factor App — https://12factor.net/
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter';
import { TransformInterceptor } from '@common/interceptors/transform.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const nodeEnv = configService.get<string>('app.NODE_ENV', 'development');
  const port = configService.get<number>('app.PORT', 3000);
  const globalPrefix = configService.get<string>('app.GLOBAL_PREFIX', 'api/v1');
  const corsOrigins = configService.get<string>('app.CORS_ORIGINS', '*');
  const shutdownTimeoutMs = configService.get<number>('app.SHUTDOWN_TIMEOUT_MS', 10_000);

  // ── Security Headers ────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: nodeEnv === 'production',
      crossOriginOpenerPolicy: nodeEnv === 'production',
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // ── CORS ────────────────────────────────────────────
  app.enableCors({
    origin: corsOrigins === '*' ? '*' : corsOrigins.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Correlation-Id',
      'Accept-Language',
    ],
    exposedHeaders: [
      'X-Request-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Retry-After',
    ],
    credentials: true,
    maxAge: 86400, // 24 hours preflight cache
  });

  // ── Compression ─────────────────────────────────────
  app.use(
    compression({
      threshold: 1024, // Only compress responses > 1KB
      level: 6, // Balanced compression level
    }),
  );

  // ── Request Size Limits ─────────────────────────────
  app.use(
    require('express').json({
      limit: '10mb',
    }),
  );
  app.use(
    require('express').urlencoded({
      extended: true,
      limit: '10mb',
    }),
  );

  // ── Global Prefix & Versioning ──────────────────────
  app.setGlobalPrefix(globalPrefix);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // ── Global Pipes ────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip non-whitelisted properties
      forbidNonWhitelisted: true, // Throw on unknown properties
      forbidUnknownValues: true, // Reject unknown values in DTOs
      transform: true, // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Auto-convert string params
        exposeDefaultValues: true,
      },
      validationError: {
        target: false, // Don't expose the full object in errors
        value: false, // Don't expose the value in errors
      },
    }),
  );

  // ── Global Filters ──────────────────────────────────
  app.useGlobalFilters(new AllExceptionsFilter());

  // ── Global Interceptors ─────────────────────────────
  app.useGlobalInterceptors(new TransformInterceptor());

  // ── Swagger Documentation ───────────────────────────
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Enterprise System API')
      .setDescription(
        'Enterprise-grade NestJS API with Clean Architecture, DDD, and CQRS.\n\n' +
          '## Authentication\n' +
          'Most endpoints require a Bearer token. Obtain one via `/auth/login`.\n\n' +
          '## Rate Limiting\n' +
          'Requests are rate-limited per IP (100/min) and per user (1000/min).\n' +
          'Rate limit headers are included in every response.\n\n' +
          '## Error Format\n' +
          'All errors follow RFC 7807 Problem Details format.',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token',
        },
        'access-token',
      )
      .addApiKey(
        {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
          description: 'API key for service-to-service authentication',
        },
        'api-key',
      )
      .addServer(`http://localhost:${port}`, 'Local Development')
      .setContact('Engineering Team', 'https://enterprise.system', 'engineering@enterprise.system')
      .setLicense('Proprietary', 'https://enterprise.system/license')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig, {
      deepScanRoutes: true,
      extraModels: [],
    });

    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
      },
      customSiteTitle: 'Enterprise System API Docs',
    });

    logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
  }

  // ── Graceful Shutdown ───────────────────────────────
  app.enableShutdownHooks();

  // Handle SIGTERM (Kubernetes, Docker)
  process.on('SIGTERM', () => {
    logger.warn('SIGTERM received. Starting graceful shutdown...');
    logger.warn(`Shutdown timeout: ${shutdownTimeoutMs}ms`);

    setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, shutdownTimeoutMs);

    app.close().then(() => {
      logger.log('Application closed successfully.');
      process.exit(0);
    });
  });

  // Handle SIGINT (Ctrl+C in development)
  process.on('SIGINT', () => {
    logger.warn('SIGINT received. Shutting down...');
    app.close().then(() => process.exit(0));
  });

  // ── Unhandled Rejections & Exceptions ───────────────
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled Promise Rejection', {
      reason: reason instanceof Error ? reason.stack : String(reason),
    });
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception. Process will exit.', {
      message: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

  // ── Start Server ────────────────────────────────────
  await app.listen(port);

  logger.log(`🚀 Application running on http://localhost:${port}/${globalPrefix}`);
  logger.log(`📋 Environment: ${nodeEnv}`);
  logger.log(`📋 Node.js: ${process.version}`);
  logger.log(`📋 PID: ${process.pid}`);
}

bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application', error);
  process.exit(1);
});
