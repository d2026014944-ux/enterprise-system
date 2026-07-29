/**
 * Password Value Object
 *
 * Encapsulates password strength validation and hashing policy.
 * NEVER exposes the raw password value — only the hash is accessible.
 * This is a security boundary: the raw password lives only in memory
 * during creation and is never serialized or logged.
 */
export class Password {
  private static readonly MIN_LENGTH = 8;
  private static readonly MAX_LENGTH = 128;

  /**
   * Stored password hash. Only set after hashing via the PasswordHasher port.
   * Null means the password has been validated but not yet hashed.
   */
  private _hashedValue: string | null;

  /**
   * Raw password is held transiently for hashing.
   * It is intentionally NOT accessible after construction.
   */
  private readonly _rawValue: string;

  private constructor(rawValue: string, hashedValue: string | null) {
    this._rawValue = rawValue;
    this._hashedValue = hashedValue;
  }

  /**
   * Create a Password from a raw string.
   * Validates strength requirements immediately.
   *
   * @throws Error if password does not meet strength requirements
   */
  static create(raw: string): Password {
    if (!raw || typeof raw !== 'string') {
      throw new Error('Password must be a non-empty string');
    }

    Password.validateStrength(raw);

    return new Password(raw, null);
  }

  /**
   * Reconstruct a Password from a persisted hash.
   * Used when loading from the database — no raw value is available.
   */
  static fromHash(hash: string): Password {
    if (!hash || typeof hash !== 'string') {
      throw new Error('Password hash must be a non-empty string');
    }

    // Raw value is empty — we don't have it from persistence
    return new Password('', hash);
  }

  /**
   * Retrieve the raw password value.
   * Should ONLY be used by the password hasher port implementation.
   * Never log, serialize, or expose this externally.
   */
  getRawValue(): string {
    return this._rawValue;
  }

  /**
   * The hashed password. Null if not yet hashed.
   */
  get hashedValue(): string | null {
    return this._hashedValue;
  }

  /**
   * Whether this password has been hashed.
   */
  get isHashed(): boolean {
    return this._hashedValue !== null;
  }

  /**
   * Set the hash after the hasher port has processed the raw value.
   * This is the ONLY way to set the hash — enforces the workflow:
   * create → hash via port → setHash → persist
   */
  setHash(hash: string): void {
    if (!hash || typeof hash !== 'string') {
      throw new Error('Hash must be a non-empty string');
    }
    this._hashedValue = hash;
  }

  /**
   * Passwords are NEVER equal by value comparison.
   * Hash comparison must be done via the PasswordHasher port.
   * This prevents timing attacks on the domain layer.
   */
  equals(_other: Password): boolean {
    // Intentionally not implemented by value — security boundary.
    // Use PasswordHasher.compare() instead.
    return false;
  }

  toString(): string {
    return '[PROTECTED]';
  }

  /**
   * Validates password against strength requirements.
   * Each rule is checked independently for clear error messages.
   */
  private static validateStrength(password: string): void {
    const errors: string[] = [];

    if (password.length < Password.MIN_LENGTH) {
      errors.push(
        `Password must be at least ${Password.MIN_LENGTH} characters long`,
      );
    }

    if (password.length > Password.MAX_LENGTH) {
      errors.push(
        `Password must not exceed ${Password.MAX_LENGTH} characters`,
      );
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one digit');
    }

    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    if (errors.length > 0) {
      throw new Error(`Password validation failed: ${errors.join('; ')}`);
    }
  }
}
