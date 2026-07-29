/**
 * Port (Interface) for password hashing.
 *
 * Abstracts the hashing algorithm (bcrypt, argon2, scrypt, etc.)
 * so the domain layer never depends on a specific implementation.
 * The infrastructure layer provides the concrete implementation.
 */
export interface PasswordHasher {
  /**
   * Hash a plaintext password.
   * Returns the hashed string suitable for persistence.
   */
  hash(plain: string): Promise<string>;

  /**
   * Compare a plaintext password against a stored hash.
   * Returns true if they match, false otherwise.
   * Must be timing-safe to prevent side-channel attacks.
   */
  compare(plain: string, hashed: string): Promise<boolean>;
}
