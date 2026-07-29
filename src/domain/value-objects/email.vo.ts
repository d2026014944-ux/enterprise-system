/**
 * Email Value Object
 *
 * Represents a validated, normalized email address.
 * Immutable — once created, cannot be changed.
 * Equality is determined by value (case-insensitive).
 */
export class Email {
  /**
   * RFC 5322 compliant-ish email regex.
   * Intentionally pragmatic — covers 99.9% of real-world emails
   * without the complexity of full RFC compliance.
   */
  private static readonly EMAIL_REGEX =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  private static readonly MAX_LENGTH = 320; // RFC 5321

  /** The normalized (lowercase, trimmed) email address. */
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Create an Email from a raw string.
   * Normalizes to lowercase and trims whitespace.
   * Throws if the value is not a valid email address.
   */
  static create(raw: string): Email {
    if (!raw || typeof raw !== 'string') {
      throw new Error('Email must be a non-empty string');
    }

    const normalized = raw.trim().toLowerCase();

    if (normalized.length > Email.MAX_LENGTH) {
      throw new Error(
        `Email exceeds maximum length of ${Email.MAX_LENGTH} characters`,
      );
    }

    if (!Email.EMAIL_REGEX.test(normalized)) {
      throw new Error(`Invalid email address: "${raw}"`);
    }

    return new Email(normalized);
  }

  /**
   * Reconstruct from persistence (assumes already validated).
   * Still normalizes for safety.
   */
  static fromPersistence(value: string): Email {
    return new Email(value.trim().toLowerCase());
  }

  /**
   * Value equality — case-insensitive comparison.
   */
  equals(other: Email): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    return this.value === other.value;
  }

  /** Extract the local part (before @) */
  get localPart(): string {
    return this.value.split('@')[0];
  }

  /** Extract the domain part (after @) */
  get domain(): string {
    return this.value.split('@')[1];
  }

  toString(): string {
    return this.value;
  }
}
