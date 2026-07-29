/**
 * Test Application Bootstrap Helper
 *
 * Creates a NestJS test container with real or mocked dependencies.
 * Used by E2E and integration tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

export interface TestAppOptions {
  /** Override providers with mocks. */
  overrides?: Array<{ provide: unknown; useValue: unknown }>;
  /** Import additional modules. */
  imports?: unknown[];
  /** Use real database (for integration tests). */
  useRealDatabase?: boolean;
  /** Use real Redis (for integration tests). */
  useRealRedis?: boolean;
}

/**
 * Create a NestJS test application.
 *
 * @example
 * const app = await createTestApp({
 *   overrides: [
 *     { provide: PrismaClient, useValue: prismaMock },
 *     { provide: Redis, useValue: redisMock },
 *   ],
 * });
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<INestApplication> {
  const { overrides = [], imports = [] } = options;

  const moduleBuilder = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, load: [() => ({
        NODE_ENV: 'test',
        LOG_LEVEL: 'error',
        JWT_SECRET: 'test-secret',
        JWT_EXPIRATION: '15m',
        JWT_REFRESH_EXPIRATION: '7d',
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
      })] }),
      ...imports,
    ],
  });

  for (const override of overrides) {
    moduleBuilder.overrideProvider(override.provide as any).useValue(override.useValue);
  }

  const module: TestingModule = await moduleBuilder.compile();

  const app = module.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init();
  return app;
}

/**
 * Create a minimal test module (no HTTP server).
 * For unit tests that need NestJS DI but not the full app.
 */
export async function createTestingModule(options: TestAppOptions = {}): Promise<TestingModule> {
  const { overrides = [], imports = [] } = options;

  const moduleBuilder = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, load: [() => ({
        NODE_ENV: 'test',
        LOG_LEVEL: 'error',
      })] }),
      ...imports,
    ],
  });

  for (const override of overrides) {
    moduleBuilder.overrideProvider(override.provide as any).useValue(override.useValue);
  }

  return moduleBuilder.compile();
}
