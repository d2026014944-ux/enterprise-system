/**
 * Base Domain Exception
 *
 * All domain-layer exceptions extend this class.
 * Provides a consistent error structure with:
 * - A machine-readable error code
 * - A human-readable message
 * - Optional metadata for debugging
 *
 * The application layer catches these and maps them to
 * appropriate HTTP status codes or API responses.
 */
export abstract class DomainException extends Error {
  public readonly code: string;
  public readonly metadata: Record<string, unknown>;

  protected constructor(
    code: string,
    message: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.metadata = metadata;

    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a requested User cannot be found.
 */
export class UserNotFoundException extends DomainException {
  constructor(identifier: string, identifierType: 'id' | 'email' = 'id') {
    super(
      'USER_NOT_FOUND',
      `User not found with ${identifierType}: ${identifier}`,
      { identifier, identifierType },
    );
  }
}

/**
 * Thrown when attempting to create a user with an email that already exists.
 */
export class EmailAlreadyExistsException extends DomainException {
  constructor(email: string) {
    super(
      'EMAIL_ALREADY_EXISTS',
      `A user with email "${email}" already exists.`,
      { email },
    );
  }
}

/**
 * Thrown when a password fails strength validation.
 */
export class InvalidPasswordException extends DomainException {
  constructor(reason: string) {
    super('INVALID_PASSWORD', `Invalid password: ${reason}`, { reason });
  }
}

/**
 * Thrown when an operation is attempted on a suspended user
 * that requires an active account.
 */
export class UserSuspendedException extends DomainException {
  constructor(userId: string) {
    super(
      'USER_SUSPENDED',
      `User "${userId}" is suspended and cannot perform this action.`,
      { userId },
    );
  }
}

/**
 * Thrown when a domain invariant is violated.
 */
export class InvariantViolationException extends DomainException {
  constructor(invariant: string) {
    super(
      'INVARIANT_VIOLATION',
      `Domain invariant violated: ${invariant}`,
      { invariant },
    );
  }
}
