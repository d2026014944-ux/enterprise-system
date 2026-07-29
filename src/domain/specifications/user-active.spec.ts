import { Specification } from './base.spec';
import { User, UserStatus } from '../entities/user.entity';

/**
 * Specification: User is active and can use the system.
 *
 * A user is considered "active" when:
 * - Their status is ACTIVE
 * - Their email is verified
 *
 * Composable example:
 *   const canPerformAction = new UserActiveSpec().and(new UserEmailVerifiedSpec());
 */
export class UserActiveSpec extends Specification<User> {
  isSatisfiedBy(user: User): boolean {
    return user.status === UserStatus.ACTIVE;
  }
}

/**
 * Specification: User's email is verified.
 */
export class UserEmailVerifiedSpec extends Specification<User> {
  isSatisfiedBy(user: User): boolean {
    return user.emailVerified;
  }
}

/**
 * Specification: User is suspended.
 */
export class UserSuspendedSpec extends Specification<User> {
  isSatisfiedBy(user: User): boolean {
    return user.status === UserStatus.SUSPENDED;
  }
}

/**
 * Specification: User can log in (active + email verified).
 * Demonstrates composition of two specifications.
 */
export class UserCanLoginSpec extends Specification<User> {
  private readonly _spec: Specification<User>;

  constructor() {
    super();
    this._spec = new UserActiveSpec().and(new UserEmailVerifiedSpec());
  }

  isSatisfiedBy(user: User): boolean {
    return this._spec.isSatisfiedBy(user);
  }
}
