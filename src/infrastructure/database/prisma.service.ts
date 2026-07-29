/**
 * Prisma Service
 *
 * Extends PrismaClient to expose all model accessors directly.
 * This is the standard NestJS pattern for Prisma.
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

export class ConcurrencyConflictError extends Error {
  constructor(entity: string, id: string) {
    super(`Concurrent modification detected on ${entity} (${id}). Please retry.`);
    this.name = 'ConcurrencyConflictError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'DatabaseError';
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly config: ConfigService) {
    const isDev = config.get('app.NODE_ENV') === 'development';
    const logQueries = config.get('database.DATABASE_LOG_QUERIES') ?? isDev;

    super({
      log: logQueries
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
          ]
        : [
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
          ],
      errorFormat: isDev ? 'pretty' : 'minimal',
    });

    if (logQueries) {
      (this as any).$on('query', (event: any) => {
        this.logger.debug(`Query: ${event.query} (${event.duration}ms)`);
      });
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  /**
   * Execute a function within a Prisma interactive transaction.
   */
  async transaction<T>(
    fn: (tx: any) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T> {
    return this.$transaction(fn, {
      maxWait: options?.maxWait ?? 5000,
      timeout: options?.timeout ?? 10000,
    });
  }

  /**
   * Health check — pings the database.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
