import { Entity } from './base.entity';
import { UniqueId } from '../value-objects/unique-id.vo';
import { Email } from '../value-objects/email.vo';
import { Password } from '../value-objects/password.vo';
import { DomainEvent } from '../domain-events/base.event';
import { UserCreatedEvent } from '../domain-events/user-created.event';
import { UserStatusChangedEvent } from '../domain-events/user-status-changed.event';

/**
 * User status enumeration — mirrors Prisma's UserStatus enum.
 */
export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/**
 * User Entity
 *
 * Rich domain model with encapsulated business logic.
 * All state transitions are explicit methods that enforce invariants
 * and raise domain events at the point of mutation.
 *
 * Invariants:
 * - Cannot activate a SUSPENDED user (must be reactivated through admin action)
 * - Cannot verify an already-verified email
 * - Cannot suspend a user that is already suspended
 * - Login can only be recorded for ACTIVE users
 * - Email changes require re-verification
 */
export class User extends Entity {
  private _email: Email;
  private _password: Password;
  private _firstName: string;
  private _lastName: string;
  private _status: UserStatus;
  private _emailVerified: boolean;
  private _lastLoginAt: Date | null;
  private _version: number;
  private _domainEvents: DomainEvent[] = [];

  private constructor(
    id: UniqueId,
    email: Email,
    password: Password,
    firstName: string,
    lastName: string,
    status: UserStatus,
    emailVerified: boolean,
    lastLoginAt: Date | null,
    version: number,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._email = email;
    this._password = password;
    this._firstName = firstName;
    this._lastName = lastName;
    this._status = status;
    this._emailVerified = emailVerified;
    this._lastLoginAt = lastLoginAt;
    this._version = version;
  }

  // ─── Factory Methods ──────────────────────────────────────────

  /**
   * Create a new User. Raises UserCreatedEvent.
   */
  static create(params: {
    email: Email;
    password: Password;
    firstName: string;
    lastName: string;
  }): User {
    const { email, password, firstName, lastName } = params;

    User.validateName(firstName, 'First name');
    User.validateName(lastName, 'Last name');

    const id = UniqueId.create();
    const user = new User(
      id,
      email,
      password,
      firstName.trim(),
      lastName.trim(),
      UserStatus.PENDING_VERIFICATION,
      false,
      null,
      1,
    );

    user.addDomainEvent(
      new UserCreatedEvent(id.toString(), email.value, new Date()),
    );

    return user;
  }

  /**
   * Reconstruct a User from persistence. No events are raised.
   */
  static reconstitute(params: {
    id: UniqueId;
    email: Email;
    password: Password;
    firstName: string;
    lastName: string;
    status: UserStatus;
    emailVerified: boolean;
    lastLoginAt: Date | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return new User(
      params.id,
      params.email,
      params.password,
      params.firstName,
      params.lastName,
      params.status,
      params.emailVerified,
      params.lastLoginAt,
      params.version,
      params.createdAt,
      params.updatedAt,
    );
  }

  // ─── Business Logic Methods ───────────────────────────────────

  /**
   * Activate the user. Transition from INACTIVE or PENDING_VERIFICATION to ACTIVE.
   *
   * Invariant: Cannot activate a SUSPENDED user.
   */
  activate(): void {
    if (this._status === UserStatus.SUSPENDED) {
      throw new Error(
        'Cannot activate a suspended user. Use reactivation instead.',
      );
    }

    if (this._status === UserStatus.ACTIVE) {
      return; // Idempotent — already active
    }

    const previousStatus = this._status;
    this._status = UserStatus.ACTIVE;
    this.incrementVersion();
    this.markModified();

    this.addDomainEvent(
      new UserStatusChangedEvent(
        this.id.toString(),
        previousStatus,
        UserStatus.ACTIVE,
        new Date(),
      ),
    );
  }

  /**
   * Suspend the user. Prevents login and access.
   *
   * Invariant: Cannot suspend an already suspended user.
   */
  suspend(): void {
    if (this._status === UserStatus.SUSPENDED) {
      throw new Error('User is already suspended.');
    }

    const previousStatus = this._status;
    this._status = UserStatus.SUSPENDED;
    this.incrementVersion();
    this.markModified();

    this.addDomainEvent(
      new UserStatusChangedEvent(
        this.id.toString(),
        previousStatus,
        UserStatus.SUSPENDED,
        new Date(),
      ),
    );
  }

  /**
   * Deactivate the user. Voluntary or administrative deactivation.
   */
  deactivate(): void {
    if (this._status === UserStatus.INACTIVE) {
      return; // Idempotent
    }

    const previousStatus = this._status;
    this._status = UserStatus.INACTIVE;
    this.incrementVersion();
    this.markModified();

    this.addDomainEvent(
      new UserStatusChangedEvent(
        this.id.toString(),
        previousStatus,
        UserStatus.INACTIVE,
        new Date(),
      ),
    );
  }

  /**
   * Mark the user's email as verified.
   *
   * Invariant: Cannot verify an already-verified email.
   */
  verifyEmail(): void {
    if (this._emailVerified) {
      throw new Error('Email is already verified.');
    }

    this._emailVerified = true;
    this.incrementVersion();

    // Auto-transition from PENDING_VERIFICATION to ACTIVE on email verify
    if (this._status === UserStatus.PENDING_VERIFICATION) {
      const previousStatus = this._status;
      this._status = UserStatus.ACTIVE;

      this.addDomainEvent(
        new UserStatusChangedEvent(
          this.id.toString(),
          previousStatus,
          UserStatus.ACTIVE,
          new Date(),
        ),
      );
    }

    this.markModified();
  }

  /**
   * Record a successful login. Updates the lastLoginAt timestamp.
   *
   * Invariant: Can only record login for ACTIVE users.
   */
  recordLogin(): void {
    if (this._status !== UserStatus.ACTIVE) {
      throw new Error(
        `Cannot record login for user with status "${this._status}". Only ACTIVE users can log in.`,
      );
    }

    this._lastLoginAt = new Date();
    this.incrementVersion();
    this.markModified();
  }

  /**
   * Change the user's email. Requires re-verification.
   */
  changeEmail(newEmail: Email): void {
    if (this._email.equals(newEmail)) {
      return; // No-op if same email
    }

    this._email = newEmail;
    this._emailVerified = false;
    this._status = UserStatus.PENDING_VERIFICATION;
    this.incrementVersion();
    this.markModified();
  }

  /**
   * Update the user's password hash.
   * Accepts a pre-hashed password value object.
   */
  changePassword(newPassword: Password): void {
    this._password = newPassword;
    this.incrementVersion();
    this.markModified();
  }

  /**
   * Update the user's profile information.
   */
  updateProfile(firstName: string, lastName: string): void {
    User.validateName(firstName, 'First name');
    User.validateName(lastName, 'Last name');

    this._firstName = firstName.trim();
    this._lastName = lastName.trim();
    this.incrementVersion();
    this.markModified();
  }

  // ─── Getters (Read-only access) ───────────────────────────────

  get email(): Email {
    return this._email;
  }

  get password(): Password {
    return this._password;
  }

  get firstName(): string {
    return this._firstName;
  }

  get lastName(): string {
    return this._lastName;
  }

  get fullName(): string {
    return `${this._firstName} ${this._lastName}`;
  }

  get status(): UserStatus {
    return this._status;
  }

  get emailVerified(): boolean {
    return this._emailVerified;
  }

  get lastLoginAt(): Date | null {
    return this._lastLoginAt;
  }

  get version(): number {
    return this._version;
  }

  get isActive(): boolean {
    return this._status === UserStatus.ACTIVE;
  }

  get isSuspended(): boolean {
    return this._status === UserStatus.SUSPENDED;
  }

  canLogin(): boolean {
    return this.isActive && this._emailVerified;
  }

  /**
   * Returns the expected version for optimistic concurrency checks.
   * Call BEFORE making changes; the infrastructure layer checks
   * that the DB row matches this version before updating.
   */
  getExpectedVersion(): number {
    return this._version - 1;
  }

  // ─── Domain Events ────────────────────────────────────────────

  /**
   * Collect all uncommitted domain events.
   * The application layer calls this after processing to dispatch them.
   */
  pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  /**
   * Check if there are uncommitted events.
   */
  hasDomainEvents(): boolean {
    return this._domainEvents.length > 0;
  }

  private addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  // ─── Internal Helpers ─────────────────────────────────────────

  private incrementVersion(): void {
    this._version++;
  }

  // ─── Validation ───────────────────────────────────────────────

  private static validateName(name: string, label: string): void {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error(`${label} must be a non-empty string.`);
    }

    if (name.trim().length > 100) {
      throw new Error(`${label} must not exceed 100 characters.`);
    }
  }

  // ─── Serialization ────────────────────────────────────────────

  override toPrimitives(): Record<string, unknown> {
    return {
      ...super.toPrimitives(),
      email: this._email.value,
      firstName: this._firstName,
      lastName: this._lastName,
      status: this._status,
      emailVerified: this._emailVerified,
      lastLoginAt: this._lastLoginAt?.toISOString() ?? null,
      version: this._version,
    };
  }
}
