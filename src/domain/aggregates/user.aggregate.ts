import { User, UserStatus } from '../entities/user.entity';
import { UniqueId } from '../value-objects/unique-id.vo';
import { Email } from '../value-objects/email.vo';
import { Password } from '../value-objects/password.vo';
import { DomainEvent } from '../domain-events/base.event';

/**
 * Role information within the aggregate.
 * Lightweight representation — the full Role entity lives in its own aggregate.
 */
export interface RoleAssignment {
  readonly id: UniqueId;
  readonly roleId: UniqueId;
  readonly roleName: string;
  readonly grantedAt: Date;
  readonly grantedBy: UniqueId | null;
}

/**
 * Session information within the aggregate.
 * Managed as a child entity — all access goes through the aggregate root.
 */
export interface SessionInfo {
  readonly id: UniqueId;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

/**
 * User Aggregate Root
 *
 * Encapsulates the User entity along with its child entities (roles, sessions).
 * All mutations go through this root to maintain aggregate invariants.
 *
 * Invariants enforced at the aggregate level:
 * - A user cannot have duplicate role assignments
 * - Sessions can only be added for active, verified users
 * - Revoked sessions cannot be revoked again
 * - Optimistic concurrency via version field
 */
export class UserAggregate {
  private readonly _user: User;
  private _roles: RoleAssignment[] = [];
  private _sessions: SessionInfo[] = [];

  private constructor(user: User) {
    this._user = user;
  }

  // ─── Factory Methods ──────────────────────────────────────────

  /**
   * Create a new UserAggregate with a fresh User entity.
   */
  static create(params: {
    email: Email;
    password: Password;
    firstName: string;
    lastName: string;
  }): UserAggregate {
    const user = User.create(params);
    return new UserAggregate(user);
  }

  /**
   * Reconstitute from persistence with all child entities.
   */
  static reconstitute(params: {
    user: User;
    roles?: RoleAssignment[];
    sessions?: SessionInfo[];
  }): UserAggregate {
    const aggregate = new UserAggregate(params.user);
    aggregate._roles = params.roles ?? [];
    aggregate._sessions = params.sessions ?? [];
    return aggregate;
  }

  // ─── Accessors ────────────────────────────────────────────────

  /** The underlying User entity. Prefer aggregate methods for mutations. */
  get user(): User {
    return this._user;
  }

  /** Read-only snapshot of role assignments. */
  get roles(): ReadonlyArray<RoleAssignment> {
    return this._roles;
  }

  /** Read-only snapshot of sessions. */
  get sessions(): ReadonlyArray<SessionInfo> {
    return this._sessions;
  }

  /** Optimistic concurrency version. */
  get version(): number {
    return this._user.version;
  }

  // ─── Role Management ──────────────────────────────────────────

  /**
   * Assign a role to the user.
   * Invariant: Cannot assign the same role twice.
   */
  assignRole(role: RoleAssignment): void {
    const alreadyAssigned = this._roles.some((r) =>
      r.roleId.equals(role.roleId),
    );

    if (alreadyAssigned) {
      throw new Error(
        `Role "${role.roleName}" is already assigned to this user.`,
      );
    }

    this._roles = [...this._roles, role];
  }

  /**
   * Remove a role from the user.
   * Returns true if the role was found and removed, false otherwise.
   */
  removeRole(roleId: UniqueId): boolean {
    const initialLength = this._roles.length;
    this._roles = this._roles.filter((r) => !r.roleId.equals(roleId));
    return this._roles.length < initialLength;
  }

  /**
   * Check if the user has a specific role.
   */
  hasRole(roleId: UniqueId): boolean {
    return this._roles.some((r) => r.roleId.equals(roleId));
  }

  /**
   * Check if the user has a role by name.
   */
  hasRoleByName(roleName: string): boolean {
    return this._roles.some((r) => r.roleName === roleName);
  }

  // ─── Session Management ───────────────────────────────────────

  /**
   * Register a new session for the user.
   * Invariant: User must be active and verified.
   */
  addSession(session: SessionInfo): void {
    if (!this._user.isActive) {
      throw new Error(
        'Cannot add a session for a non-active user.',
      );
    }

    if (!this._user.emailVerified) {
      throw new Error(
        'Cannot add a session for a user with unverified email.',
      );
    }

    this._sessions = [...this._sessions, session];
  }

  /**
   * Revoke a session by ID.
   * Invariant: Session must exist and not already be revoked.
   */
  revokeSession(sessionId: UniqueId): void {
    const sessionIndex = this._sessions.findIndex((s) =>
      s.id.equals(sessionId),
    );

    if (sessionIndex === -1) {
      throw new Error('Session not found.');
    }

    const session = this._sessions[sessionIndex];

    if (session.revokedAt !== null) {
      throw new Error('Session is already revoked.');
    }

    const revokedSession: SessionInfo = {
      ...session,
      revokedAt: new Date(),
    };

    this._sessions = [
      ...this._sessions.slice(0, sessionIndex),
      revokedSession,
      ...this._sessions.slice(sessionIndex + 1),
    ];
  }

  /**
   * Get all active (non-revoked, non-expired) sessions.
   */
  getActiveSessions(): SessionInfo[] {
    const now = new Date();
    return this._sessions.filter(
      (s) => s.revokedAt === null && s.expiresAt > now,
    );
  }

  /**
   * Revoke all active sessions. Useful for security incidents.
   */
  revokeAllSessions(): void {
    const now = new Date();
    this._sessions = this._sessions.map((s) =>
      s.revokedAt === null ? { ...s, revokedAt: now } : s,
    );
  }

  // ─── Delegated Business Logic ─────────────────────────────────

  activate(): void {
    this._user.activate();
  }

  suspend(): void {
    this._user.suspend();
    // Suspend all active sessions when user is suspended
    this.revokeAllSessions();
  }

  deactivate(): void {
    this._user.deactivate();
    this.revokeAllSessions();
  }

  verifyEmail(): void {
    this._user.verifyEmail();
  }

  recordLogin(): void {
    this._user.recordLogin();
  }

  changeEmail(newEmail: Email): void {
    this._user.changeEmail(newEmail);
  }

  changePassword(newPassword: Password): void {
    this._user.changePassword(newPassword);
  }

  updateProfile(firstName: string, lastName: string): void {
    this._user.updateProfile(firstName, lastName);
  }

  // ─── Domain Events ────────────────────────────────────────────

  /**
   * Collect all uncommitted domain events from the aggregate.
   */
  pullDomainEvents(): DomainEvent[] {
    return this._user.pullDomainEvents();
  }

  hasDomainEvents(): boolean {
    return this._user.hasDomainEvents();
  }

  // ─── Serialization ────────────────────────────────────────────

  toPrimitives(): Record<string, unknown> {
    return {
      user: this._user.toPrimitives(),
      roles: this._roles.map((r) => ({
        id: r.id.toString(),
        roleId: r.roleId.toString(),
        roleName: r.roleName,
        grantedAt: r.grantedAt.toISOString(),
        grantedBy: r.grantedBy?.toString() ?? null,
      })),
      sessions: this._sessions.map((s) => ({
        id: s.id.toString(),
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        expiresAt: s.expiresAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        revokedAt: s.revokedAt?.toISOString() ?? null,
      })),
    };
  }
}
