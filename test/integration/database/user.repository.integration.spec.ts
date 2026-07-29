/**
 * UserRepository — Integration Tests
 *
 * Uses TestContainers for a real PostgreSQL database.
 * Tests: CRUD operations, concurrent access, transaction rollback.
 */

import { PrismaClient } from '@prisma/client';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { UserRepository } from '../../../src/infrastructure/repositories/user.repository';

describe('UserRepository (Integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let repository: UserRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('test_db')
      .withUsername('test')
      .withPassword('test')
      .start();

    prisma = new PrismaClient({
      datasources: { db: { url: container.getConnectionUri() } },
    });

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(320) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        status VARCHAR(30) DEFAULT 'ACTIVE',
        email_verified BOOLEAN DEFAULT false,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        version INT DEFAULT 1
      );
    `);

    repository = new UserRepository(prisma as any);
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  // ─── CRUD ───

  describe('CRUD operations', () => {
    it('should create and retrieve a user', async () => {
      const created = await prisma.user.create({
        data: {
          email: 'integration@example.com',
          passwordHash: '$2a$12$hashed',
          firstName: 'Integration',
          lastName: 'Test',
        },
      });

      const found = await repository.findById(created.id);

      expect(found).toBeDefined();
      expect(found!.email.value).toBe('integration@example.com');
    });

    it('should update a user', async () => {
      const created = await prisma.user.create({
        data: {
          email: 'update@example.com',
          passwordHash: '$2a$12$hashed',
          firstName: 'Before',
          lastName: 'Update',
        },
      });

      await prisma.user.update({
        where: { id: created.id },
        data: { firstName: 'After', version: { increment: 1 } },
      });

      const found = await repository.findById(created.id);
      expect(found!.firstName).toBe('After');
    });

    it('should delete a user', async () => {
      const created = await prisma.user.create({
        data: {
          email: 'delete@example.com',
          passwordHash: '$2a$12$hashed',
          firstName: 'Delete',
          lastName: 'Me',
        },
      });

      await prisma.user.delete({ where: { id: created.id } });

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });
  });

  // ─── Concurrent access ───

  describe('concurrent access', () => {
    it('should handle concurrent reads', async () => {
      await prisma.user.create({
        data: {
          email: 'concurrent@example.com',
          passwordHash: '$2a$12$hashed',
          firstName: 'Concurrent',
          lastName: 'Read',
        },
      });

      const results = await Promise.all(
        Array.from({ length: 10 }, () => repository.findByEmail('concurrent@example.com')),
      );

      results.forEach((r) => {
        expect(r).toBeDefined();
        expect(r!.email.value).toBe('concurrent@example.com');
      });
    });

    it('should detect optimistic concurrency conflict', async () => {
      const created = await prisma.user.create({
        data: {
          email: 'conflict@example.com',
          passwordHash: '$2a$12$hashed',
          firstName: 'Conflict',
          lastName: 'Test',
          version: 1,
        },
      });

      // Two concurrent updates with same version
      const update1 = prisma.user.update({
        where: { id: created.id, version: 1 },
        data: { firstName: 'Update1', version: 2 },
      });

      const update2 = prisma.user.update({
        where: { id: created.id, version: 1 },
        data: { firstName: 'Update2', version: 2 },
      });

      // One should succeed, one should fail
      const results = await Promise.allSettled([update1, update2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
    });
  });

  // ─── Transaction rollback ───

  describe('transaction rollback', () => {
    it('should rollback on error within transaction', async () => {
      const countBefore = await prisma.user.count();

      try {
        await prisma.$transaction(async (tx) => {
          await tx.user.create({
            data: {
              email: 'rollback@example.com',
              passwordHash: '$2a$12$hashed',
              firstName: 'Roll',
              lastName: 'Back',
            },
          });
          throw new Error('Simulated failure');
        });
      } catch {
        // Expected
      }

      const countAfter = await prisma.user.count();
      expect(countAfter).toBe(countBefore);
    });
  });
});
