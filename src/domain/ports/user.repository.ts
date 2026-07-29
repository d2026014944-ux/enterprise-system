import type { User } from '../entities/user.entity';
import type { UniqueId } from '../value-objects/unique-id.vo';
import type { Email } from '../value-objects/email.vo';

/**
 * Port (Interface) for User persistence.
 *
 * This is a PRIMARY port — the application layer depends on it,
 * and the infrastructure layer implements it.
 *
 * Key principles:
 * - Returns domain entities, NEVER database models
 * - Throws DomainException on not-found (does not return null silently)
 * - Save handles both create and update (upsert semantics)
 * - No SQL/ORM concepts leak through this interface
 */
export interface UserRepository {
  /**
   * Find a user by their unique identifier.
   * @throws UserNotFoundException if no user exists with the given ID
   */
  findById(id: UniqueId): Promise<User>;

  /**
   * Find a user by their email address.
   * @throws UserNotFoundException if no user exists with the given email
   */
  findByEmail(email: Email): Promise<User>;

  /**
   * Check if a user exists with the given email.
   * Used for uniqueness validation without full entity retrieval.
   */
  existsByEmail(email: Email): Promise<boolean>;

  /**
   * Persist a user (create or update).
   * The implementation handles mapping domain entity → persistence model.
   * Returns the saved entity (may include generated fields).
   */
  save(user: User): Promise<User>;

  /**
   * Delete a user by ID.
   * Soft-delete semantics should be handled by the implementation.
   * @throws UserNotFoundException if no user exists with the given ID
   */
  delete(id: UniqueId): Promise<void>;
}
