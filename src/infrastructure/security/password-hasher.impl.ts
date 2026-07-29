/**
 * Password Hasher Implementation
 *
 * Implements the PasswordHasher port using bcryptjs.
 * Features:
 * - Configurable salt rounds (cost factor)
 * - Timing-safe comparison to prevent timing attacks
 * - Automatic salt generation per hash
 *
 * Security notes:
 * - bcrypt is intentionally slow to resist brute-force attacks
 * - Salt rounds of 12 = ~250ms per hash on modern hardware
 * - Never log or expose password values or hashes
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { PasswordHasher } from '@domain/ports/password-hasher.port';

@Injectable()
export class PasswordHasherImpl implements PasswordHasher {
  private readonly logger = new Logger(PasswordHasherImpl.name);
  private readonly saltRounds: number;

  constructor(private readonly config: ConfigService) {
    // Default to 12 rounds — good balance of security and performance
    // In production, tune based on your hardware (~250ms target per hash)
    this.saltRounds = 12;
  }

  /**
   * Hash a plaintext password using bcrypt.
   *
   * - Generates a random salt internally
   * - Returns the full bcrypt hash (includes algorithm, cost, salt, and hash)
   * - Typical output: $2a$12$<22 chars salt><31 chars hash>
   */
  async hash(plainText: string): Promise<string> {
    if (!plainText || typeof plainText !== 'string') {
      throw new Error('Password to hash must be a non-empty string');
    }

    try {
      const startTime = Date.now();
      const hashedValue = await bcrypt.hash(plainText, this.saltRounds);
      const duration = Date.now() - startTime;

      this.logger.debug(`Password hashed in ${duration}ms (cost: ${this.saltRounds})`);

      // Warn if hashing is too fast (salt rounds too low)
      if (duration < 100) {
        this.logger.warn(
          `Password hash took only ${duration}ms. Consider increasing salt rounds.`,
        );
      }

      return hashedValue;
    } catch (error) {
      this.logger.error('Password hashing failed', error);
      throw new Error('Password hashing failed');
    }
  }

  /**
   * Compare a plaintext password against a stored bcrypt hash.
   *
   * Uses bcrypt's built-in constant-time comparison to prevent timing attacks.
   * bcrypt.compare extracts the salt from the hash and re-hashes the input
   * with the same salt, then compares the results in constant time.
   */
  async compare(plainText: string, hashedValue: string): Promise<boolean> {
    if (!plainText || typeof plainText !== 'string') {
      throw new Error('Password to compare must be a non-empty string');
    }

    if (!hashedValue || typeof hashedValue !== 'string') {
      throw new Error('Hash to compare must be a non-empty string');
    }

    try {
      const startTime = Date.now();
      const isMatch = await bcrypt.compare(plainText, hashedValue);
      const duration = Date.now() - startTime;

      this.logger.debug(`Password comparison completed in ${duration}ms`);

      return isMatch;
    } catch (error) {
      this.logger.error('Password comparison failed', error);
      // On error, return false — never leak information about why comparison failed
      return false;
    }
  }
}
