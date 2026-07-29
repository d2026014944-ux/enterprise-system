/**
 * User Entity — Unit Tests
 *
 * Tests all business methods, invariant enforcement, and domain events.
 * AAA pattern: Arrange → Act → Assert
 */

import { User } from '../../../src/domain/entities/user.entity';
import { UserId } from '../../../src/domain/value-objects/user-id.vo';
import { Email } from '../../../src/domain/value-objects/email.vo';
import { Password } from '../../../src/domain/value-objects/password.vo';

describe('User Entity', () => {
  // ─── Factory helpers ───

  function createActiveUser(overrides?: Partial<{ email: string; status: string }>): User {
    const email = Email.fromValidated(overrides?.email ?? 'test@example.com');
    const password = Password.fromHash('$2a$12$hashedpassword');
    const id = UserId.from('550e8400-e29b-41d4-a716-446655440000');

    return User.reconstitute({
      id,
      email,
      passwordHash: password,
      firstName: 'John',
      lastName: 'Doe',
      status: (overrides?.status as any) ?? 'ACTIVE',
      emailVerified: true,
      lastLoginAt: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      version: 1,
    });
  }

  // ─── activate() ───

  describe('activate()', () => {
    it('should activate an inactive user', () => {
      // Arrange
      const user = createActiveUser({ status: 'INACTIVE' });

      // Act
      const result = user.activate();

      // Assert
      expect(result.isSuccess).toBe(true);
      expect(user.status).toBe('ACTIVE');
    });

    it('should activate a pending verification user', () => {
      const user = createActiveUser({ status: 'PENDING_VERIFICATION' });
      const result = user.activate();
      expect(result.isSuccess).toBe(true);
      expect(user.status).toBe('ACTIVE');
    });

    it('should reject activating a suspended user', () => {
      // Arrange
      const user = createActiveUser({ status: 'SUSPENDED' });

      // Act
      const result = user.activate();

      // Assert
      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe('INVALID_STATUS_TRANSITION');
      expect(user.status).toBe('SUSPENDED');
    });

    it('should be idempotent for already active user', () => {
      const user = createActiveUser({ status: 'ACTIVE' });
      const result = user.activate();
      expect(result.isSuccess).toBe(true);
      expect(user.status).toBe('ACTIVE');
    });
  });

  // ─── suspend() ───

  describe('suspend()', () => {
    it('should suspend an active user', () => {
      const user = createActiveUser({ status: 'ACTIVE' });
      const result = user.suspend();
      expect(result.isSuccess).toBe(true);
      expect(user.status).toBe('SUSPENDED');
    });

    it('should reject suspending an already suspended user', () => {
      const user = createActiveUser({ status: 'SUSPENDED' });
      const result = user.suspend();
      expect(result.isFailure).toBe(true);
    });
  });

  // ─── verifyEmail() ───

  describe('verifyEmail()', () => {
    it('should mark email as verified', () => {
      // Arrange
      const email = Email.fromValidated('test@example.com');
      const password = Password.fromHash('$2a$12$hashed');
      const id = UserId.from('550e8400-e29b-41d4-a716-446655440000');
      const user = User.reconstitute({
        id, email, passwordHash: password,
        firstName: 'John', lastName: 'Doe',
        status: 'PENDING_VERIFICATION',
        emailVerified: false,
        lastLoginAt: null,
        createdAt: new Date(), updatedAt: new Date(),
        version: 1,
      });

      // Act
      user.verifyEmail();

      // Assert
      expect(user.emailVerified).toBe(true);
      expect(user.status).toBe('ACTIVE');
    });
  });

  // ─── recordLogin() ───

  describe('recordLogin()', () => {
    it('should update lastLoginAt timestamp', () => {
      const user = createActiveUser();
      const before = new Date();

      user.recordLogin();

      expect(user.lastLoginAt).toBeDefined();
      expect(user.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should emit a domain event on login', () => {
      const user = createActiveUser();

      user.recordLogin();

      const events = user.getDomainEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.constructor.name === 'UserLoggedInEvent')).toBe(true);
    });
  });

  // ─── Domain Events ───

  describe('domain events', () => {
    it('should collect domain events', () => {
      const user = createActiveUser();
      user.recordLogin();
      const events = user.getDomainEvents();
      expect(Array.isArray(events)).toBe(true);
    });

    it('should clear domain events', () => {
      const user = createActiveUser();
      user.recordLogin();
      user.clearDomainEvents();
      expect(user.getDomainEvents()).toHaveLength(0);
    });
  });

  // ─── Immutability / Value Object semantics ───

  describe('value semantics', () => {
    it('should expose email as a value object', () => {
      const user = createActiveUser();
      expect(user.email).toBeInstanceOf(Email);
      expect(user.email.value).toBe('test@example.com');
    });

    it('should expose id as a value object', () => {
      const user = createActiveUser();
      expect(user.id).toBeDefined();
      expect(user.id.value).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });
});
