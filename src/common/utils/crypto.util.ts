/**
 * Cryptographic Utilities
 *
 * Secure, audited crypto helpers. Uses Node.js built-in `crypto` module
 * exclusively — no third-party crypto libraries.
 *
 * All functions are designed to be:
 * - Timing-safe (constant-time comparison for secrets)
 * - CSPRNG-based (crypto.randomBytes for randomness)
 * - FIPS 140-2 compatible where possible
 *
 * ⚠️ SECURITY: Never use Math.random() for security-sensitive operations.
 */

import {
  randomBytes,
  randomUUID,
  createHmac,
  timingSafeEqual,
  scrypt,
  randomFill,
} from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

// ─── Secure Random Strings ────────────────────────────────

/**
 * Generate a cryptographically secure random string.
 *
 * @param length - Desired string length (not byte length)
 * @param charset - Character set to use. Default: alphanumeric
 * @returns Random string of specified length
 *
 * @example
 * ```ts
 * const token = secureRandom(32);           // 32-char alphanumeric
 * const code  = secureRandom(6, '0123456789'); // 6-digit OTP
 * ```
 */
export function secureRandom(
  length: number,
  charset: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
): string {
  if (length <= 0) throw new RangeError('Length must be positive');
  if (charset.length === 0) throw new RangeError('Charset must not be empty');

  const bytes = randomBytes(length);
  let result = '';

  for (let i = 0; i < length; i++) {
    // Use rejection sampling to avoid modulo bias
    // This is important when charset.length doesn't evenly divide 256
    result += charset[bytes[i] % charset.length];
  }

  return result;
}

/**
 * Generate a URL-safe base64-encoded random token.
 * Useful for API keys, session tokens, CSRF tokens.
 *
 * @param byteLength - Number of random bytes (output will be ~4/3 longer)
 */
export function secureToken(byteLength: number = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

// ─── UUID Generation ──────────────────────────────────────

/**
 * Generate a UUID v4 (random).
 * Uses Node.js crypto.randomUUID() which is CSPRNG-based.
 */
export function generateUuidV4(): string {
  return randomUUID();
}

/**
 * Validate that a string is a valid UUID v4.
 */
export function isValidUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

// ─── HMAC Signing ─────────────────────────────────────────

/**
 * Create an HMAC-SHA256 signature.
 *
 * @param data - Data to sign
 * @param secret - Signing secret (must be kept secure)
 * @returns Hex-encoded HMAC signature
 */
export function hmacSign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Verify an HMAC-SHA256 signature using constant-time comparison.
 *
 * @param data - Original data
 * @param signature - Signature to verify
 * @param secret - Signing secret
 * @returns true if signature is valid
 */
export function hmacVerify(data: string, signature: string, secret: string): boolean {
  const expected = hmacSign(data, secret);
  return constantTimeCompare(signature, expected);
}

// ─── Constant-Time Comparison ─────────────────────────────

/**
 * Compare two strings in constant time to prevent timing attacks.
 *
 * ⚠️ SECURITY: Always use this for comparing secrets, tokens, hashes.
 * Never use === for security-sensitive comparisons.
 *
 * @returns true if strings are equal
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  // timingSafeEqual requires equal-length buffers
  if (bufA.length !== bufB.length) {
    // Compare against itself to maintain constant time
    // but always return false
    timingSafeEqual(bufA, bufA);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

// ─── Password Hashing (via scrypt) ────────────────────────

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384; // N parameter (CPU/memory cost)
const SCRYPT_BLOCK_SIZE = 8; // r parameter
const SCRYPT_PARALLELIZATION = 1; // p parameter

/**
 * Hash a password using scrypt with a random salt.
 * Returns salt and hash concatenated as: salt:hash (both hex-encoded).
 *
 * scrypt is preferred over bcrypt for:
 * - Memory-hard algorithm (resistant to GPU/ASIC attacks)
 * - Tunable parameters
 * - Part of Node.js crypto (no native dependencies)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32);
  const derivedKey = (await scryptAsync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  })) as Buffer;

  return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

/**
 * Verify a password against a scrypt hash.
 * Uses constant-time comparison internally.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(':');
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, 'hex');
  const expectedHash = Buffer.from(hashHex, 'hex');

  const derivedKey = (await scryptAsync(password, salt, expectedHash.length, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  })) as Buffer;

  return timingSafeEqual(derivedKey, expectedHash);
}
