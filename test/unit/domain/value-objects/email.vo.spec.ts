/**
 * Email Value Object — Unit Tests
 *
 * Tests validation, normalization, and equality.
 * AAA pattern throughout.
 */

import { Email } from '../../../../src/domain/value-objects/email.vo';

describe('Email Value Object', () => {
  // ─── Creation / Validation ───

  describe('create()', () => {
    it('should create a valid email', () => {
      const result = Email.create('user@example.com');
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().value).toBe('user@example.com');
    });

    it('should normalize to lowercase', () => {
      const result = Email.create('User@Example.COM');
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().value).toBe('user@example.com');
    });

    it('should trim whitespace', () => {
      const result = Email.create('  user@example.com  ');
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().value).toBe('user@example.com');
    });

    it('should reject empty string', () => {
      const result = Email.create('');
      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe('INVALID_EMAIL');
    });

    it('should reject null/undefined', () => {
      const result = Email.create(null as any);
      expect(result.isFailure).toBe(true);
    });

    it('should reject email without @', () => {
      const result = Email.create('userexample.com');
      expect(result.isFailure).toBe(true);
    });

    it('should reject email without domain', () => {
      const result = Email.create('user@');
      expect(result.isFailure).toBe(true);
    });

    it('should reject email without local part', () => {
      const result = Email.create('@example.com');
      expect(result.isFailure).toBe(true);
    });

    it('should reject email exceeding 320 characters', () => {
      const longLocal = 'a'.repeat(300);
      const result = Email.create(`${longLocal}@example.com`);
      expect(result.isFailure).toBe(true);
    });

    it('should accept valid email with subdomain', () => {
      const result = Email.create('user@sub.example.com');
      expect(result.isSuccess).toBe(true);
    });

    it('should accept email with plus addressing', () => {
      const result = Email.create('user+tag@example.com');
      expect(result.isSuccess).toBe(true);
    });

    it('should accept email with dots in local part', () => {
      const result = Email.create('first.last@example.com');
      expect(result.isSuccess).toBe(true);
    });
  });

  // ─── fromValidated() ───

  describe('fromValidated()', () => {
    it('should create without validation (trusted input)', () => {
      const email = Email.fromValidated('DB_VALUE@EXAMPLE.COM');
      expect(email.value).toBe('db_value@example.com');
    });
  });

  // ─── Equality ───

  describe('equals()', () => {
    it('should be equal for same value', () => {
      const a = Email.fromValidated('user@example.com');
      const b = Email.fromValidated('user@example.com');
      expect(a.equals(b)).toBe(true);
    });

    it('should not be equal for different values', () => {
      const a = Email.fromValidated('user1@example.com');
      const b = Email.fromValidated('user2@example.com');
      expect(a.equals(b)).toBe(false);
    });

    it('should be case-insensitive equal after normalization', () => {
      const a = Email.create('User@Example.COM').getValue();
      const b = Email.create('user@example.com').getValue();
      expect(a.equals(b)).toBe(true);
    });
  });

  // ─── Domain getter ───

  describe('domain', () => {
    it('should extract the domain part', () => {
      const email = Email.fromValidated('user@example.com');
      expect(email.domain).toBe('example.com');
    });
  });

  // ─── toString ───

  describe('toString()', () => {
    it('should return the email value', () => {
      const email = Email.fromValidated('user@example.com');
      expect(email.toString()).toBe('user@example.com');
    });
  });
});
