import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly prisma: PrismaClient;

  constructor(private readonly config: ConfigService) {
    const isDev = config.get('app.NODE_ENV') === 'development';
    this.prisma = new PrismaClient({
      log: isDev ? [{ emit: 'event', level: 'query' }] : [],
      errorFormat: isDev ? 'pretty' : 'minimal',
    });
  }

  // ── Model accessors (explicit for TypeScript) ──
  get user() { return this.prisma.user; }
  get session() { return this.prisma.session; }
  get role() { return this.prisma.role; }
  get userRole() { return this.prisma.userRole; }
  get apiKey() { return this.prisma.apiKey; }
  get auditLog() { return this.prisma.auditLog; }
  get tenant() { return this.prisma.tenant; }
  get tenantMember() { return this.prisma.tenantMember; }
  get notification() { return this.prisma.notification; }

  async onModuleInit(): Promise<void> {
    await this.prisma.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
    this.logger.log('Database disconnected');
  }

  async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
