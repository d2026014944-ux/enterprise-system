import { v4 as uuidv4 } from 'uuid';

/**
 * Abstract base class for all commands in the CQRS pattern.
 *
 * Commands represent write intents — they describe *what* the system should do,
 * not *how*. Each command carries a unique identity for idempotency tracking
 * and a timestamp for auditing.
 *
 * Design decisions:
 * - Immutable by convention (all fields readonly)
 * - Carries correlation/causation IDs for distributed tracing
 * - Supports idempotency via commandId
 */
export abstract class BaseCommand {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly correlationId?: string;
  public readonly causationId?: string;

  constructor(params?: { correlationId?: string; causationId?: string }) {
    this.commandId = uuidv4();
    this.timestamp = new Date();
    this.correlationId = params?.correlationId;
    this.causationId = params?.causationId;
  }

  /** Human-readable command name for logging/metrics. */
  abstract get commandName(): string;
}

/**
 * Command Bus — Port interface for dispatching commands.
 *
 * The infrastructure layer implements this (e.g., NestJS CQRS module,
 * in-memory bus, or distributed command bus).
 */
export interface CommandBus {
  execute<TResult>(command: BaseCommand): Promise<TResult>;
}

export const COMMAND_BUS = Symbol('COMMAND_BUS');
