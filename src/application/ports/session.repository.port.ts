/**
 * Session Repository — Application-layer port for session persistence.
 *
 * The domain layer doesn't own sessions as a separate aggregate;
 * they are managed here in the application layer for authentication flows.
 */
export interface SessionSnapshot {
  id: string;
  userId: string;
  refreshToken: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface SessionRepository {
  findById(id: string): Promise<SessionSnapshot | null>;
  findByRefreshToken(refreshToken: string): Promise<SessionSnapshot | null>;
  create(session: Omit<SessionSnapshot, 'id' | 'createdAt' | 'revokedAt'>): Promise<SessionSnapshot>;
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<number>;
  countActiveForUser(userId: string): Promise<number>;
}

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
