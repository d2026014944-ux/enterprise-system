import { User } from '../entities/user.entity';
import { UniqueId } from '../value-objects/unique-id.vo';
import { Email } from '../value-objects/email.vo';
import { Password } from '../value-objects/password.vo';
import { EmailAlreadyExistsException } from '../exceptions/domain.exception';
import type { UserRepository } from '../ports/user.repository';
import type { PasswordHasher } from '../ports/password-hasher.port';
import type { EventPublisher } from '../ports/event-publisher.port';

/**
 * User Domain Service
 *
 * Orchestrates cross-aggregate or cross-entity logic that doesn't naturally
 * belong to a single entity. This is NOT a dumping ground for business logic —
 * most logic should live in entities and value objects.
 *
 * Responsibilities:
 * - Enforcing uniqueness constraints (email uniqueness)
 * - Coordinating with external ports (password hashing)
 * - Dispatching domain events after successful operations
 *
 * This service depends only on ports (interfaces), never on infrastructure.
 */
export class UserDomainService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly eventPublisher: EventPublisher,
  ) {}

  /**
   * Register a new user.
   *
   * Workflow:
   * 1. Check email uniqueness
   * 2. Hash the password
   * 3. Create the user entity
   * 4. Persist and dispatch events
   *
   * @throws EmailAlreadyExistsException if the email is already taken
   */
  async registerUser(params: {
    email: Email;
    rawPassword: Password;
    firstName: string;
    lastName: string;
  }): Promise<User> {
    const { email, rawPassword, firstName, lastName } = params;

    // 1. Uniqueness check
    const emailExists = await this.userRepository.existsByEmail(email);
    if (emailExists) {
      throw new EmailAlreadyExistsException(email.value);
    }

    // 2. Hash password
    const hash = await this.passwordHasher.hash(rawPassword.getRawValue());
    const hashedPassword = Password.fromHash(hash);

    // 3. Create user entity
    const user = User.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
    });

    // 4. Persist
    const savedUser = await this.userRepository.save(user);

    // 5. Dispatch domain events
    const events = savedUser.pullDomainEvents();
    if (events.length > 0) {
      await this.eventPublisher.publish(events);
    }

    return savedUser;
  }

  /**
   * Authenticate a user by email and password.
   *
   * @returns The user if credentials are valid, null otherwise.
   *         Does NOT throw on invalid credentials (prevents user enumeration).
   */
  async authenticate(
    email: Email,
    rawPassword: string,
  ): Promise<User | null> {
    let user: User;

    try {
      user = await this.userRepository.findByEmail(email);
    } catch {
      // User not found — return null (don't reveal whether email exists)
      return null;
    }

    // Verify password against stored hash
    const storedHash = user.password.hashedValue;
    if (!storedHash) {
      return null;
    }

    const isValid = await this.passwordHasher.compare(rawPassword, storedHash);
    if (!isValid) {
      return null;
    }

    // Record login and persist
    user.recordLogin();
    const savedUser = await this.userRepository.save(user);

    // Dispatch events
    const events = savedUser.pullDomainEvents();
    if (events.length > 0) {
      await this.eventPublisher.publish(events);
    }

    return savedUser;
  }

  /**
   * Change a user's password.
   *
   * Validates the current password before allowing the change.
   *
   * @throws UserNotFoundException if user doesn't exist
   * @returns false if current password is incorrect
   */
  async changePassword(
    userId: string,
    currentPasswordRaw: string,
    newPassword: Password,
  ): Promise<boolean> {
    const id = UniqueId.fromString(userId);
    const user = await this.userRepository.findById(id);

    // Verify current password
    const storedHash = user.password.hashedValue;
    if (!storedHash) {
      return false;
    }

    const isValid = await this.passwordHasher.compare(
      currentPasswordRaw,
      storedHash,
    );
    if (!isValid) {
      return false;
    }

    // Hash new password
    const newHash = await this.passwordHasher.hash(newPassword.getRawValue());
    const hashedNewPassword = Password.fromHash(newHash);

    // Update via entity method (enforces invariants, raises events)
    user.changePassword(hashedNewPassword);

    const savedUser = await this.userRepository.save(user);

    const events = savedUser.pullDomainEvents();
    if (events.length > 0) {
      await this.eventPublisher.publish(events);
    }

    return true;
  }
}
