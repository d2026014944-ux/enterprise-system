/**
 * EncryptionService — AES-256-GCM encryption for sensitive data at rest
 *
 * Provides authenticated encryption with associated data (AEAD).
 * Supports key rotation by maintaining multiple encryption keys
 * and always encrypting with the current key.
 *
 * Security properties:
 * - AES-256-GCM: authenticated encryption (confidentiality + integrity)
 * - Unique IV (96-bit) per encryption operation
 * - Key rotation: decrypt with any historical key, encrypt with current
 * - Timing-safe comparison for authentication tags
 * - Secure random generation via crypto.randomBytes
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'crypto';

export interface EncryptedData {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded initialization vector */
  iv: string;
  /** Base64-encoded authentication tag */
  tag: string;
  /** Key version identifier for rotation support */
  keyVersion: number;
}

interface EncryptionKey {
  key: Buffer;
  version: number;
  createdAt: Date;
}

@Injectable()
export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // 96 bits (recommended for GCM)
  private static readonly TAG_LENGTH = 16; // 128 bits
  // SALT_LENGTH is used internally by crypto.scrypt
  // private static readonly SALT_LENGTH = 32;
  private static readonly KEY_LENGTH = 32; // 256 bits

  private readonly keys: EncryptionKey[] = [];
  private currentKeyVersion: number = 0;

  constructor(private readonly configService: ConfigService) {
    this.initializeKeys();
  }

  /**
   * Initialize encryption keys from configuration.
   * In production, keys should come from a KMS (AWS KMS, HashiCorp Vault, etc.)
   */
  private initializeKeys(): void {
    const masterKey = this.configService.getOrThrow<string>(
      'ENCRYPTION_MASTER_KEY',
    );
    const keyVersions = this.configService.get<number>(
      'ENCRYPTION_KEY_VERSIONS',
      1,
    );

    // Derive keys for each version using scrypt
    for (let v = 1; v <= keyVersions; v++) {
      const salt = `enterprise-encryption-v${v}`;
      const key = scryptSync(masterKey, salt, EncryptionService.KEY_LENGTH);
      this.keys.push({
        key,
        version: v,
        createdAt: new Date(),
      });
    }

    this.currentKeyVersion = keyVersions;
  }

  /**
   * Encrypt plaintext using AES-256-GCM with the current key.
   */
  encrypt(plaintext: string): EncryptedData {
    if (!plaintext) {
      throw new Error('Cannot encrypt empty or null plaintext');
    }

    const currentKey = this.getCurrentKey();
    const iv = randomBytes(EncryptionService.IV_LENGTH);

    const cipher = createCipheriv(
      EncryptionService.ALGORITHM,
      currentKey.key,
      iv,
      { authTagLength: EncryptionService.TAG_LENGTH },
    );

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      keyVersion: currentKey.version,
    };
  }

  /**
   * Decrypt ciphertext using the appropriate key version.
   */
  decrypt(encryptedData: EncryptedData): string {
    const key = this.getKeyByVersion(encryptedData.keyVersion);

    if (!key) {
      throw new Error(
        `Encryption key version ${encryptedData.keyVersion} not found. Possible key rotation issue.`,
      );
    }

    const decipher = createDecipheriv(
      EncryptionService.ALGORITHM,
      key.key,
      Buffer.from(encryptedData.iv, 'base64'),
      { authTagLength: EncryptionService.TAG_LENGTH },
    );

    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedData.ciphertext, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * Re-encrypt data with the current key (for key rotation).
   */
  reEncrypt(encryptedData: EncryptedData): EncryptedData {
    const plaintext = this.decrypt(encryptedData);
    return this.encrypt(plaintext);
  }

  /**
   * Generate cryptographically secure random bytes.
   */
  generateSecureRandom(length: number = 32): string {
    return randomBytes(length).toString('base64url');
  }

  /**
   * Generate a secure random token (URL-safe).
   */
  generateToken(length: number = 48): string {
    return randomBytes(length).toString('base64url');
  }

  /**
   * Hash a value using SHA-256 (for non-password hashing needs).
   */
  hash(value: string): string {
    const { createHash } = require('crypto');
    return createHash('sha256').update(value).digest('hex');
  }

  /**
   * Constant-time string comparison to prevent timing attacks.
   */
  timingSafeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return timingSafeEqual(bufA, bufB);
  }

  /**
   * Get the current encryption key.
   */
  private getCurrentKey(): EncryptionKey {
    const key = this.keys.find((k) => k.version === this.currentKeyVersion);
    if (!key) {
      throw new Error('No current encryption key available');
    }
    return key;
  }

  /**
   * Get a specific key version (for decryption).
   */
  private getKeyByVersion(version: number): EncryptionKey | undefined {
    return this.keys.find((k) => k.version === version);
  }
}
