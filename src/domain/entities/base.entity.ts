import { UniqueId } from '../value-objects/unique-id.vo';

/**
 * Abstract base class for all Domain Entities.
 *
 * Identity-based equality: two entities are equal iff they share the same ID,
 * regardless of attribute differences. This is the fundamental distinction
 * between Entities and Value Objects in DDD.
 *
 * Design decisions:
 * - Timestamps are managed internally (createdAt immutable, updatedAt auto-mutates)
 * - Domain events are collected for the Unit of Work / event dispatcher pattern
 * - No public setters — all state changes happen through entity methods
 */
export abstract class Entity<TId extends UniqueId = UniqueId> {
  private readonly _id: TId;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  protected constructor(id: TId, createdAt?: Date, updatedAt?: Date) {
    this._id = id;
    this._createdAt = createdAt ?? new Date();
    this._updatedAt = updatedAt ?? this._createdAt;
  }

  /** Unique identity of this entity. Immutable. */
  get id(): TId {
    return this._id;
  }

  /** Timestamp when this entity was created. Immutable. */
  get createdAt(): Date {
    return this._createdAt;
  }

  /** Timestamp of last modification. Updated automatically on mutations. */
  get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Identity equality — the core DDD principle for entities.
   * Two entities are equal if and only if they have the same identity.
   */
  equals(other: Entity<TId>): boolean {
    if (other === null || other === undefined) {
      return false;
    }

    if (this === other) {
      return true;
    }

    return this._id.equals(other._id);
  }

  /**
   * Mark this entity as modified. Call this from any method that changes state.
   * Protected so only subclasses (the actual entities) can trigger it.
   */
  protected markModified(): void {
    this._updatedAt = new Date();
  }

  /**
   * Return a plain object representation for serialization.
   * Subclasses should override to include their specific fields.
   */
  toPrimitives(): Record<string, unknown> {
    return {
      id: this._id.toString(),
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}
