/**
 * Generic Base Repository
 *
 * Provides common CRUD operations, pagination, and transaction support.
 * Concrete repositories extend this and add domain-specific queries.
 */
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginatedResult, PaginationParams } from '@domain/ports/repository.port';
import { PrismaService } from './prisma.service';

export abstract class BaseRepository<
  TModel,
  TDomain,
  TWhereUnique extends Record<string, unknown>,
  TCreateInput,
  TUpdateInput,
> {
  protected readonly logger: Logger;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly modelName: string,
  ) {
    this.logger = new Logger(`${this.constructor.name}`);
  }

  /**
   * Get the delegate (table accessor) from PrismaClient.
   * Subclasses must implement this to return their specific model delegate.
   */
  protected abstract getDelegate(
    tx?: Prisma.TransactionClient,
  ): {
    findUnique: (args: { where: TWhereUnique }) => Promise<TModel | null>;
    findMany: (args?: any) => Promise<TModel[]>;
    count: (args?: any) => Promise<number>;
    create: (args: { data: TCreateInput }) => Promise<TModel>;
    update: (args: { where: TWhereUnique; data: TUpdateInput }) => Promise<TModel>;
    delete: (args: { where: TWhereUnique }) => Promise<TModel>;
  };

  /**
   * Map a persistence model to a domain entity.
   */
  protected abstract toDomain(model: TModel): TDomain;

  /**
   * Map a domain entity to persistence create input.
   */
  protected abstract toCreateInput(entity: TDomain): TCreateInput;

  /**
   * Map a domain entity to persistence update input.
   */
  protected abstract toUpdateInput(entity: TDomain): TUpdateInput;

  /**
   * Find a single record by its unique identifier.
   */
  async findById(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TDomain | null> {
    try {
      const delegate = this.getDelegate(tx);
      const model = await delegate.findUnique({
        where: { id } as unknown as TWhereUnique,
      });
      return model ? this.toDomain(model) : null;
    } catch (error) {
      this.logger.error(`findById(${id}) failed`, error);
      throw error;
    }
  }

  /**
   * Paginated query.
   */
  async findPaginated(
    params: PaginationParams,
    findManyArgs?: Omit<Prisma.UserFindManyArgs, 'skip' | 'take'>,
    tx?: Prisma.TransactionClient,
  ): Promise<PaginatedResult<TDomain>> {
    const { page, limit } = params;
    const skip = (page - 1) * limit;

    try {
      const delegate = this.getDelegate(tx);
      const [items, total] = await Promise.all([
        delegate.findMany({
          ...findManyArgs,
          skip,
          take: limit,
        }),
        delegate.count({
          where: findManyArgs?.where,
        }),
      ]);

      return {
        items: items.map((item) => this.toDomain(item)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error('findPaginated failed', error);
      throw error;
    }
  }

  /**
   * Create a new record.
   */
  async create(
    entity: TDomain,
    tx?: Prisma.TransactionClient,
  ): Promise<TDomain> {
    try {
      const delegate = this.getDelegate(tx);
      const data = this.toCreateInput(entity);
      const model = await delegate.create({ data });
      return this.toDomain(model);
    } catch (error) {
      this.logger.error('create failed', error);
      throw error;
    }
  }

  /**
   * Update an existing record.
   */
  async update(
    entity: TDomain,
    tx?: Prisma.TransactionClient,
  ): Promise<TDomain> {
    try {
      const delegate = this.getDelegate(tx);
      const data = this.toUpdateInput(entity);
      const model = await delegate.update({
        where: { id: (entity as any).id.value } as unknown as TWhereUnique,
        data,
      });
      return this.toDomain(model);
    } catch (error) {
      this.logger.error('update failed', error);
      throw error;
    }
  }

  /**
   * Delete a record by ID.
   */
  async delete(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    try {
      const delegate = this.getDelegate(tx);
      await delegate.delete({
        where: { id } as unknown as TWhereUnique,
      });
    } catch (error) {
      this.logger.error(`delete(${id}) failed`, error);
      throw error;
    }
  }
}
