import { v4 as uuidv4 } from 'uuid';

/**
 * Abstract base class for all queries in the CQRS pattern.
 *
 * Queries represent read intents — they fetch data without side effects.
 * Queries never modify state; they return DTOs (read models).
 */
export abstract class BaseQuery {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor() {
    this.queryId = uuidv4();
    this.timestamp = new Date();
  }

  abstract get queryName(): string;
}

/**
 * Query Bus — Port interface for dispatching queries.
 */
export interface QueryBus {
  execute<TResult>(query: BaseQuery): Promise<TResult>;
}

export const QUERY_BUS = Symbol('QUERY_BUS');
