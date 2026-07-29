/**
 * Password Value Object — Unit Tests
 *
 * Tests password strength validation and all rejection cases.
 */

import { Password } from '../../../../src/domain/value-objects/password.vo';

describe('Password Value Object', () => {
  // ─── create() — Valid passwords ───

  describe('create() — valid', () => {
    it('should accept a strong password', () => {
      const result = Password.create('Str0ng!Pass');
      expect(result.isSuccess).toBe(true);
    });

    it('should accept password at minimum length (8 chars)', () => {
      const result = Password.create('Ab1!xxxx');
      expect(result.isSuccess).toBe(true);
    });

    it('should accept password at maximum length (128 chars)', () => {
      const long = 'A1!' + 'a'.repeat(125);
      const result = Password.create(long);
      expect(result.isSuccess).toBe(true);
    });

    it('should accept all special characters', () => {
      const result = Password.create('Ab1!@#$%^&*()');
      expect(result.isSuccess).toBe(true);
    });
  });

  // ─── create() — Rejection cases ───

  describe('create() — rejections', () => {
    it('should reject empty string', () => {
      const result = Password.create('');
      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe('INVALID_PASSWORD');
    });

    it('should reject null/undefined', () => {
      const result = Password.create(null as any);
      expect(result.isFailure).toBe(true);
    });

    it('should reject password shorter than 8 characters', () => {
      const result = Password.create('Ab1!xxx');
      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toContain('at least 8');
    });

    it('should reject password longer than 128 characters', () => {
      const tooLong = 'A1!' + 'a'.repeat(126);
      const result = Password.create(tooLong);
      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toContain('128');
    });

    it('should reject password without uppercase letter', () => {
      const result = Password.create('ab1!xxxx');
      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toContain('uppercase');
    });

    it('should reject password without lowercase letter', () => {
      const result = Password.create('AB1!XXXX');
      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toContain('lowercase');
    });

    it('should reject password without digit', () => {
      const result = Password.create('Abc!xxxx');
      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toContain('digit');
    });

    it('should reject password without special character', () => {
      const result = Password.create('Abc1xxxx');
      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toContain('special');
    });
  });

  // ─── fromHash() ───

  describe('fromHash()', () => {
    it('should create a hashed password wrapper', () => {
      const hash = '$2a$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ0';
      const pw = Password.fromHash(hash);
      expect(pw.value).toBe(hash);
      expect(pw.isHashed).toBe(true);
    });

    it('should throw when getRaw() is called on hashed password', () => {
      const pw = Password.fromHash('$2a$12$hash');
      expect(() => pw.getRaw()).toThrow('Cannot retrieve raw value from a hashed password');
    });
  });

  // ─── getRaw() ───

  describe('getRaw()', () => {
    it('should return raw value for unhashed password', () => {
      const result = Password.create('Str0ng!Pass');
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().getRaw()).toBe('Str0ng!Pass');
    });

    it('should report isHashed as false for raw passwords', () => {
      const result = Password.create('Str0ng!Pass');
      expect(result.getValue().isHashed).toBe(false);
    });
  });
});
