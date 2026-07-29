/**
 * UserRepository — Unit Tests
 *
 * Tests with Prisma mock: CRUD operations, mapping between Prisma model and domain entity,
 * error transformation.
 */

import { UserRepository } from '../../../../src/infrastructure/repositories/user.repository';
import { createPrismaMock, PrismaMock } from '../../../mocks/prisma.mock';
import { aUser } from '../../../fixtures/users.fixture';

describe('UserRepository', () => {
  let repository: UserRepository;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = createPrismaMock();
    repository = new UserRepository(prisma as any);
  });

  // ─── findById ───

  describe('findById()', () => {
    it('should return a user when found', async () => {
      const fixture = aUser().build();
      prisma.user.findUnique.mockResolvedValue(fixture as any);

      const result = await repository.findById(fixture.id);

      expect(result).toBeDefined();
      expect(result!.email.value).toBe(fixture.email);
      expect(result!.id.value).toBe(fixture.id);
    });

    it('should return null when not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await repository.findById('non-existent-id');

      expect(result).toBeNull();
    });

    it('should call Prisma with correct where clause', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await repository.findById('test-id');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        include: expect.any(Object),
      });
    });
  });

  // ─── findByEmail ───

  describe('findByEmail()', () => {
    it('should find user by normalized email', async () => {
      const fixture = aUser().withEmail('user@example.com').build();
      prisma.user.findUnique.mockResolvedValue(fixture as any);

      const result = await repository.findByEmail('user@example.com');

      expect(result).toBeDefined();
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
        include: expect.any(Object),
      });
    });

    it('should return null for unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await repository.findByEmail('unknown@example.com');

      expect(result).toBeNull();
    });
  });

  // ─── save ───

  describe('save()', () => {
    it('should create a new user', async () => {
      const fixture = aUser().build();
      prisma.user.create.mockResolvedValue(fixture as any);

      // Build a minimal domain user-like object
      const user = {
        id: { value: fixture.id },
        email: { value: fixture.email },
        passwordHash: { value: fixture.passwordHash },
        firstName: fixture.firstName,
        lastName: fixture.lastName,
        status: fixture.status,
        emailVerified: fixture.emailVerified,
        version: fixture.version,
      };

      const result = await repository.save(user as any);

      expect(result).toBeDefined();
      expect(prisma.user.create).toHaveBeenCalled();
    });
  });

  // ─── Error transformation ───

  describe('error handling', () => {
    it('should propagate Prisma errors', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('DB connection failed'));

      await expect(repository.findById('any-id')).rejects.toThrow('DB connection failed');
    });

    it('should handle unique constraint violations', async () => {
      const prismaError = new Error('Unique constraint');
      (prismaError as any).code = 'P2002';
      prisma.user.create.mockRejectedValue(prismaError);

      const user = { id: { value: 'id' }, email: { value: 'dup@example.com' } };

      await expect(repository.save(user as any)).rejects.toThrow();
    });
  });

  // ─── Prisma-to-Domain mapping ───

  describe('mapping', () => {
    it('should map Prisma model to domain entity with correct fields', async () => {
      const fixture = aUser()
        .withId('550e8400-e29b-41d4-a716-446655440001')
        .withEmail('mapped@example.com')
        .withFirstName('Mapped')
        .withLastName('User')
        .withStatus('ACTIVE')
        .withEmailVerified(true)
        .withVersion(3)
        .build();

      prisma.user.findUnique.mockResolvedValue(fixture as any);

      const result = await repository.findById(fixture.id);

      expect(result!.id.value).toBe(fixture.id);
      expect(result!.email.value).toBe('mapped@example.com');
      expect(result!.firstName).toBe('Mapped');
      expect(result!.lastName).toBe('User');
      expect(result!.status).toBe('ACTIVE');
      expect(result!.emailVerified).toBe(true);
    });
  });
});
