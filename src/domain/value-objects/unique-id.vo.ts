/**
 * UniqueId Value Object
 *
 * Represents a UUID v4 identifier. Immutable, validated at construction time.
 * Follows the Value Object pattern — equality is determined by value, not reference.
 */
export class UniqueId {
  private static readonly UUID_V4_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Generate a new UniqueId with a cryptographically random UUID v4.
   * Uses crypto.randomUUID() when available, falls back to manual generation.
   */
  static create(): UniqueId {
    const uuid = UniqueId.generateUuidV4();
    return new UniqueId(uuid);
  }

  /**
   * Reconstruct a UniqueId from an existing string.
   * Throws if the string is not a valid UUID v4.
   */
  static fromString(value: string): UniqueId {
    if (!value || typeof value !== 'string') {
      throw new Error('UniqueId value must be a non-empty string');
    }

    const trimmed = value.trim();

    if (!UniqueId.UUID_V4_REGEX.test(trimmed)) {
      throw new Error(`Invalid UUID v4 format: "${trimmed}"`);
    }

    return new UniqueId(trimmed);
  }

  /**
   * Value equality — two UniqueIds are equal iff their string values match.
   */
  equals(other: UniqueId): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  /**
   * Generate a UUID v4 without external dependencies.
   * Uses crypto.getRandomValues if available (browser/Node 19+),
   * otherwise falls back to Math.random (non-cryptographic but valid v4 format).
   */
  private static generateUuidV4(): string {
    try {
      // Node.js 19+ / modern browsers
      if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
        return globalThis.crypto.randomUUID();
      }
    } catch {
      // Fall through to manual generation
    }

    // Manual UUID v4 generation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
