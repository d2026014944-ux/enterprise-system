/**
 * IsUnique Validator
 *
 * Custom class-validator decorator that checks if a value is unique
 * in a database table. Used for fields like email, username, slug.
 *
 * Usage:
 * ```ts
 * class CreateUserDto {
 *   @IsUnique('users', 'email')
 *   email: string;
 * }
 * ```
 *
 * Implementation: Registers a custom async validator with class-validator
 * that queries the database via PrismaService.
 */

import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

/**
 * Validator constraint that checks uniqueness in the database.
 * Registered as a NestJS injectable to access PrismaService.
 */
@ValidatorConstraint({ name: 'isUnique', async: true })
@Injectable()
export class IsUniqueConstraint implements ValidatorConstraintInterface {
  constructor(private readonly prisma: PrismaService) {}

  async validate(value: unknown, args: ValidationArguments): Promise<boolean> {
    if (value === null || value === undefined || value === '') {
      return true; // Let @IsNotEmpty handle empty values
    }

    const [table, column, excludeIdColumn] = args.constraints as [
      string,
      string,
      string | undefined,
    ];

    try {
      // Build the where clause
      const where: Record<string, unknown> = {
        [column]: value,
      };

      // If an exclude column is specified (for update operations),
      // exclude the current record from the uniqueness check
      const object = args.object as Record<string, unknown>;
      if (excludeIdColumn && object[excludeIdColumn]) {
        where['NOT'] = { id: object[excludeIdColumn] };
      }

      // Query the database
      const record = await (this.prisma as any)[table].findFirst({ where });

      return record === null;
    } catch {
      // If the query fails (table doesn't exist, etc.), fail validation
      return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    const [table, column] = args.constraints as [string, string];
    return `${args.property} must be unique in ${table}.${column}. A record with this value already exists.`;
  }
}

/**
 * @IsUnique('table', 'column', validationOptions?)
 *
 * Validates that the field's value is unique in the specified table.column.
 *
 * @param table - Database table name (Prisma model name, lowercase)
 * @param column - Column name to check
 * @param excludeIdColumn - Optional column to exclude (e.g., 'id' for updates)
 * @param validationOptions - class-validator options
 *
 * @example
 * ```ts
 * // Create: check uniqueness
 * @IsUnique('users', 'email')
 * email: string;
 *
 * // Update: exclude current record
 * @IsUnique('users', 'email', 'excludeId')
 * email: string;
 * ```
 */
export function IsUnique(
  table: string,
  column: string,
  excludeIdColumn?: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isUnique',
      target: object.constructor,
      propertyName,
      constraints: [table, column, excludeIdColumn],
      options: validationOptions,
      validator: IsUniqueConstraint,
    });
  };
}
