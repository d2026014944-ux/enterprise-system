/**
 * Unit of Work — Transaction management port.
 *
 * Wraps multiple repository operations in a single atomic transaction.
 * Follows the pattern: begin → execute mutations → commit/rollback.
 *
 * Supports nested transactions via savepoints for complex use cases
 * that need partial rollback without aborting the entire transaction.
 *
 * Usage:
 * ```ts
 * await this.uow.begin();
 * try {
 *   await this.userRepo.save(user);
 *   await this.roleRepo.assign(userId, roleId);
 *   await this.uow.commit();
 * } catch {
 *   await this.uow.rollback();
 * }
 * ```
 */
export interface UnitOfWork {
  /** Starts a new transaction. Throws if already in a transaction. */
  begin(): Promise<void>;

  /** Commits the current transaction. */
  commit(): Promise<void>;

  /** Rolls back the current transaction. */
  rollback(): Promise<void>;

  /**
   * Creates a savepoint within the current transaction.
   * Allows partial rollback without aborting the entire transaction.
   */
  createSavepoint(name: string): Promise<void>;

  /** Rolls back to a specific savepoint. */
  rollbackToSavepoint(name: string): Promise<void>;

  /** Releases a savepoint (makes it no longer rollback-able). */
  releaseSavepoint(name: string): Promise<void>;

  /** Whether a transaction is currently active. */
  isActive(): boolean;

  /**
   * Executes a function within a transaction.
   * Automatically begins, commits on success, and rolls back on failure.
   */
  execute<T>(fn: () => Promise<T>): Promise<T>;
}

export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');
