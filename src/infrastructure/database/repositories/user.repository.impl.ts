/**
 * User Repository Implementation
 *
 * Implements the UserRepository port from the domain layer.
 * Maps between Prisma persistence models and domain User entity.
 * Handles optimistic concurrency via version checks.
 * Transforms Prisma errors into domain exceptions.
 *
 * Domain contract:
 * - findById / findByEmail: throw UserNotFoundException if not found
 * - save: handles both create and update (upsert semantics)
 * - Returns domain entities, NEVER database models
 */
import { Injectable } from '@nestjs/common';
import { Prisma, User as PrismaUser } from '@prisma/client';
import { User, UserStatus } from '@domain/entities/user.entity';
import { UniqueId } from '@domain/value-objects/unique-id.vo';
import { Email } from '@domain/value-objects/email.vo';
import { Password } from '@domain/value-objects/password.vo';
import type { UserRepository } from '@domain/ports/user.repository';
import {
  UserNotFoundException,
  EmailAlreadyExistsException,
} from '@domain/exceptions/domain.exception';
import { PrismaService, ConcurrencyConflictError } from '../prisma.service';

@Injectable()
export class UserRepositoryImpl implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Port Implementation ─────────────────────────────────

  /**
   * Find a user by their unique identifier.
   * @throws UserNotFoundException if no user exists with the given ID
   */
  async findById(id: UniqueId): Promise<User> {
    try {
      const row = await this.prisma.client.user.findUnique({
        where: { id: id.value },
      });

      if (!row) {
        throw new UserNotFoundException(id.value, 'id');
      }

      return this.toDomain(row);
    } catch (error) {
      if (error instanceof UserNotFoundException) throw error;
      PrismaService.transformError(error, { entity: 'User', id: id.value });
    }
  }

  /**
   * Find a user by their email address.
   * @throws UserNotFoundException if no user exists with the given email
   */
  async findByEmail(email: Email): Promise<User> {
    try {
      const row = await this.prisma.client.user.findUnique({
        where: { email: email.value },
      });

      if (!row) {
        throw new UserNotFoundException(email.value, 'email');
      }

      return this.toDomain(row);
    } catch (error) {
      if (error instanceof UserNotFoundException) throw error;
      PrismaService.transformError(error, { entity: 'User' });
    }
  }

  /**
   * Check if a user exists with the given email.
   * Used for uniqueness validation without full entity retrieval.
   */
  async existsByEmail(email: Email): Promise<boolean> {
    try {
      const count = await this.prisma.client.user.count({
        where: { email: email.value },
      });
      return count > 0;
    } catch (error) {
      PrismaService.transformError(error, { entity: 'User' });
    }
  }

  /**
   * Persist a user (create or update).
   * Uses upsert semantics — if the user exists (by ID), update; otherwise create.
   * Enforces optimistic concurrency via version check on update.
   */
  async save(user: User): Promise<User> {
    try {
      // Check if user exists to decide between create and update
      const existingRow = await this.prisma.client.user.findUnique({
        where: { id: user.id.value },
      });

      if (existingRow) {
        // ── Update with optimistic concurrency ──────────
        const expectedVersion = user.getExpectedVersion();

        const updatedRow = await this.prisma.client.user.update({
          where: {
            id: user.id.value,
            version: expectedVersion, // Optimistic concurrency check
          },
          data: {
            email: user.email.value,
            passwordHash: user.password.hashedValue ?? undefined,
            firstName: user.firstName,
            lastName: user.lastName,
            status: user.status as any,
            emailVerified: user.emailVerified,
            lastLoginAt: user.lastLoginAt,
            version: user.version,
            updatedAt: new Date(),
          },
        });

        return this.toDomain(updatedRow);
      } else {
        // ── Create ──────────────────────────────────────
        const createdRow = await this.prisma.client.user.create({
          data: {
            id: user.id.value,
            email: user.email.value,
            passwordHash: user.password.hashedValue ?? '',
            firstName: user.firstName,
            lastName: user.lastName,
            status: user.status as any,
            emailVerified: user.emailVerified,
            lastLoginAt: user.lastLoginAt,
            version: user.version,
          },
        });

        return this.toDomain(createdRow);
      }
    } catch (error) {
      // P2002 on email → EmailAlreadyExistsException
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = (error.meta?.target as string[]) ?? [];
        if (target.includes('email')) {
          throw new EmailAlreadyExistsException(user.email.value);
        }
      }

      // P2025 on update → concurrency conflict
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new ConcurrencyConflictError('User', user.id.value);
      }

      PrismaService.transformError(error, {
        entity: 'User',
        id: user.id.value,
      });
    }
  }

  /**
   * Delete a user by ID.
   * @throws UserNotFoundException if no user exists with the given ID
   */
  async delete(id: UniqueId): Promise<void> {
    try {
      await this.prisma.client.user.delete({
        where: { id: id.value },
      });
    } catch (error) {
      PrismaService.transformError(error, { entity: 'User', id: id.value });
    }
  }

  // ─── Mapping ─────────────────────────────────────────────

  /**
   * Map a Prisma User row to a domain User entity.
   * Reconstitutes value objects from raw persistence values.
   * Uses User.reconstitute() — no domain events are raised.
   */
  private toDomain(row: PrismaUser): User {
    return User.reconstitute({
      id: UniqueId.fromString(row.id),
      email: Email.fromPersistence(row.email),
      password: Password.fromHash(row.passwordHash),
      firstName: row.firstName,
      lastName: row.lastName,
      status: row.status as unknown as UserStatus,
      emailVerified: row.emailVerified,
      lastLoginAt: row.lastLoginAt,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
