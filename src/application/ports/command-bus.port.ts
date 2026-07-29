/**
 * Command Bus Port — Application-layer interface for command dispatching.
 *
 * This port decouples use cases from the concrete bus implementation.
 * The infrastructure layer binds this to NestJS CQRS, a custom bus,
 * or a distributed command bus.
 */
export interface ICommandBus {
  execute<TCommand, TResult = void>(command: TCommand): Promise<TResult>;
}

export const COMMAND_BUS_PORT = Symbol('COMMAND_BUS_PORT');
