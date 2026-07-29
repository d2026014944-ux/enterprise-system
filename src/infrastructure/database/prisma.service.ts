/**
 * Prisma Service
 *
 * Wraps PrismaClient as a NestJS injectable with proper lifecycle management.
 * - Connects on module init
 * - Disconnects on module destroy (graceful shutdown)
 * - Query logging in development
 * - Error transformation from Prisma errors to domain exceptions
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  EmailAlreadyExistsException,
  UserNotFoundException,
} from '@domain/exceptions/domain.exception';

/**
 * Infrastructure-level error for concurrency conflicts.
 * Not in the domain layer — this is a technical concern.
 */
export class ConcurrencyConflictError extends Error {
  constructor(entity: string, id: string) {
    super(
      `Concurrent modification detected on ${entity} (${id}). Please retry.`,
    );
    this.name = 'ConcurrencyConflictError';
  }
}

/**
 * Generic infrastructure error for database failures.
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private prisma: PrismaClient;

  constructor(private readonly config: ConfigService) {
    const isDev = this.config.get('app.NODE_ENV') === 'development';
    const logQueries =
      this.config.get('database.DATABASE_LOG_QUERIES') ?? isDev;

    this.prisma = new PrismaClient({
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.prisma as any).$on('query', (event: Prisma.QueryEvent) => {
        this.logger.debug(`Query: ${event.query} (${event.duration}ms)`);
      });
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.prisma.$connect();
      this.logger.log('Database connection established');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
    this.logger.log('Database connection closed');
  }

  /**
   * Access the underlying PrismaClient.
   * Use this for direct queries when the repository abstraction isn't needed.
   */
  get client(): PrismaClient {
    return this.prisma;
  }

  /**
   * Execute a function within a Prisma interactive transaction.
   * The transaction is automatically committed on success, rolled back on error.
   */
  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T> {
    return this.prisma.$transaction(fn, {
      maxWait: options?.maxWait ?? 5000,
      timeout: options?.timeout ?? 10000,
    });
  }

  /**
   * Transform Prisma errors into domain-meaningful exceptions.
   * Call this in repository implementations when catching Prisma errors.
   */
  static transformError(
    error: unknown,
    context?: { entity?: string; id?: string },
  ): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002': {
          // Unique constraint violation
          const target = (error.meta?.target as string[]) ?? [];
          if (target.includes('email')) {
            const email =
              (error.meta?.cause as string) ??
              (Array.isArray(error.meta?.target)
                ? String(error.meta.target[1] ?? 'unknown')
                : 'unknown');
            throw new EmailAlreadyExistsException(email);
          }
          throw new DatabaseError(
            `Unique constraint violation on ${target.join(', ')}`,
            error,
          );
        }

        case 'P2025': {
          // Record not found
          const entity = context?.entity ?? 'Record';
          const id = context?.id ?? 'unknown';
          if (entity === 'User') {
            throw new UserNotFoundException(id);
          }
          throw new DatabaseError(`${entity} not found: ${id}`, error);
        }

        case 'P2034': {
          // Transaction conflict — optimistic concurrency
          const entity = context?.entity ?? 'Entity';
          const id = context?.id ?? 'unknown';
          throw new ConcurrencyConflictError(entity, id);
        }

        default:
          throw new DatabaseError(
            `Database error [${error.code}]: ${error.message}`,
            error,
          );
      }
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      throw new DatabaseError(`Validation error: ${error.message}`, error);
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      throw new DatabaseError(
        `Database initialization failed: ${error.message}`,
        error,
      );
    }

    // Re-throw domain exceptions as-is
    if (
      error instanceof Error &&
      error.constructor.name.endsWith('Exception')
    ) {
      throw error;
    }

    throw new DatabaseError('An unexpected database error occurred', error);
  }

  /**
   * Health check — pings the database.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
