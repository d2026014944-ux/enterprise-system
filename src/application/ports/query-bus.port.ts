/**
 * Query Bus Port — Application-layer interface for query dispatching.
 */
export interface IQueryBus {
  execute<TQuery, TResult = unknown>(query: TQuery): Promise<TResult>;
}

export const QUERY_BUS_PORT = Symbol('QUERY_BUS_PORT');
