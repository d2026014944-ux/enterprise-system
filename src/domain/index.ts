// ─── Value Objects ──────────────────────────────────────────────
export { UniqueId } from './value-objects/unique-id.vo';
export { Email } from './value-objects/email.vo';
export { Password } from './value-objects/password.vo';

// ─── Entities ───────────────────────────────────────────────────
export { Entity } from './entities/base.entity';
export { User, UserStatus } from './entities/user.entity';

// ─── Aggregates ─────────────────────────────────────────────────
export { UserAggregate } from './aggregates/user.aggregate';
export type { RoleAssignment, SessionInfo } from './aggregates/user.aggregate';

// ─── Domain Events ──────────────────────────────────────────────
export { DomainEvent } from './domain-events/base.event';
export { UserCreatedEvent } from './domain-events/user-created.event';
export { UserStatusChangedEvent } from './domain-events/user-status-changed.event';

// ─── Domain Services ────────────────────────────────────────────
export { UserDomainService } from './domain-services/user-domain.service';

// ─── Ports (Interfaces) ─────────────────────────────────────────
export type { UserRepository } from './ports/user.repository';
export type { PasswordHasher } from './ports/password-hasher.port';
export type { EventPublisher } from './ports/event-publisher.port';

// ─── Specifications ─────────────────────────────────────────────
export { Specification } from './specifications/base.spec';
export {
  UserActiveSpec,
  UserEmailVerifiedSpec,
  UserSuspendedSpec,
  UserCanLoginSpec,
} from './specifications/user-active.spec';

// ─── Exceptions ─────────────────────────────────────────────────
export {
  DomainException,
  UserNotFoundException,
  EmailAlreadyExistsException,
  InvalidPasswordException,
  UserSuspendedException,
  InvariantViolationException,
} from './exceptions/domain.exception';
