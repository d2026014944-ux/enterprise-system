/**
 * Abstract Specification Pattern
 *
 * Encapsulates business rules as composable, reusable objects.
 * Specifications can be combined using AND, OR, and NOT logic
 * to build complex predicates from simple ones.
 *
 * This follows the Specification pattern from DDD (Eric Evans)
 * and enables:
 * - Reusable business rules
 * - Composable query predicates
 * - Self-documenting rule names
 * - Testable business logic in isolation
 */
export abstract class Specification<T> {
  /**
   * Test whether the given candidate satisfies this specification.
   */
  abstract isSatisfiedBy(candidate: T): boolean;

  /**
   * Combine with another specification using AND logic.
   * Both specifications must be satisfied.
   */
  and(other: Specification<T>): Specification<T> {
    return new AndSpecification<T>(this, other);
  }

  /**
   * Combine with another specification using OR logic.
   * At least one specification must be satisfied.
   */
  or(other: Specification<T>): Specification<T> {
    return new OrSpecification<T>(this, other);
  }

  /**
   * Negate this specification.
   * Returns true when this specification would return false, and vice versa.
   */
  not(): Specification<T> {
    return new NotSpecification<T>(this);
  }
}

/**
 * Composite AND specification.
 * Satisfied only when both operands are satisfied.
 */
class AndSpecification<T> extends Specification<T> {
  constructor(
    private readonly left: Specification<T>,
    private readonly right: Specification<T>,
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.left.isSatisfiedBy(candidate) && this.right.isSatisfiedBy(candidate);
  }
}

/**
 * Composite OR specification.
 * Satisfied when at least one operand is satisfied.
 */
class OrSpecification<T> extends Specification<T> {
  constructor(
    private readonly left: Specification<T>,
    private readonly right: Specification<T>,
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.left.isSatisfiedBy(candidate) || this.right.isSatisfiedBy(candidate);
  }
}

/**
 * Negation specification.
 * Satisfied when the wrapped specification is NOT satisfied.
 */
class NotSpecification<T> extends Specification<T> {
  constructor(private readonly wrapped: Specification<T>) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return !this.wrapped.isSatisfiedBy(candidate);
  }
}
