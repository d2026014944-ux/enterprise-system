import type { User, UniqueId } from '@domain/index';

/**
 * User Repository — Application-layer port.
 *
 * Re-exports the domain port with a DI token for NestJS injection.
 * The domain defines the interface; the application layer adds the token.
 */
export interface UserRepository {
  findById(id: UniqueId): Promise<User>;
  findByEmail(email: import('@domain/index').Email): Promise<User>;
  existsByEmail(email: import('@domain/index').Email): Promise<boolean>;
  save(user: User): Promise<User>;
  delete(id: UniqueId): Promise<void>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
