/**
 * Test Fixtures — Object Mother Pattern
 *
 * Provides UserBuilder with fluent API for creating test data.
 * Every field has a sensible default so tests only specify what matters.
 */

export interface UserFixture {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
  emailVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export class UserBuilder {
  private user: UserFixture = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'test@example.com',
    passwordHash: '$2a$12$LJ3m4ys3Lz0YE2C5E0J5xuR5X5X5X5X5X5X5X5X5X5X5X5X5X5',
    firstName: 'John',
    lastName: 'Doe',
    status: 'ACTIVE',
    emailVerified: true,
    lastLoginAt: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    version: 1,
  };

  withId(id: string): this {
    this.user.id = id;
    return this;
  }

  withEmail(email: string): this {
    this.user.email = email;
    return this;
  }

  withPasswordHash(hash: string): this {
    this.user.passwordHash = hash;
    return this;
  }

  withFirstName(name: string): this {
    this.user.firstName = name;
    return this;
  }

  withLastName(name: string): this {
    this.user.lastName = name;
    return this;
  }

  withStatus(status: UserFixture['status']): this {
    this.user.status = status;
    return this;
  }

  withEmailVerified(verified: boolean): this {
    this.user.emailVerified = verified;
    return this;
  }

  withLastLoginAt(date: Date | null): this {
    this.user.lastLoginAt = date;
    return this;
  }

  withVersion(version: number): this {
    this.user.version = version;
    return this;
  }

  withCreatedAt(date: Date): this {
    this.user.createdAt = date;
    return this;
  }

  build(): UserFixture {
    return { ...this.user };
  }

  buildMany(count: number, overrides?: Partial<UserFixture>): UserFixture[] {
    return Array.from({ length: count }, (_, i) => ({
      ...this.user,
      ...overrides,
      id: `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`,
      email: `user${i}@example.com`,
    }));
  }
}

/** Convenience factory. */
export function aUser(): UserBuilder {
  return new UserBuilder();
}

/** Session fixture. */
export interface SessionFixture {
  id: string;
  userId: string;
  refreshToken: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}

export class SessionBuilder {
  private session: SessionFixture = {
    id: '660e8400-e29b-41d4-a716-446655440000',
    userId: '550e8400-e29b-41d4-a716-446655440000',
    refreshToken: 'refresh-token-abc123',
    userAgent: 'Mozilla/5.0',
    ipAddress: '127.0.0.1',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    revokedAt: null,
  };

  withUserId(userId: string): this {
    this.session.userId = userId;
    return this;
  }

  withRefreshToken(token: string): this {
    this.session.refreshToken = token;
    return this;
  }

  withExpiresAt(date: Date): this {
    this.session.expiresAt = date;
    return this;
  }

  revoked(): this {
    this.session.revokedAt = new Date();
    return this;
  }

  build(): SessionFixture {
    return { ...this.session };
  }
}

export function aSession(): SessionBuilder {
  return new SessionBuilder();
}
