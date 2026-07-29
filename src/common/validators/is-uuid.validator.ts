/**
 * UUID v4 Validation Decorator
 *
 * Custom class-validator decorator for UUID v4 validation.
 * Uses strict regex that only accepts UUID version 4 format.
 *
 * Usage:
 * ```ts
 * class GetUserQuery {
 *   @IsUuidV4()
 *   id: string;
 * }
 * ```
 */

import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * UUID v4 regex pattern.
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * Where y is one of [8, 9, a, b]
 */
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@ValidatorConstraint({ name: 'isUuidV4', async: false })
export class IsUuidV4Constraint implements ValidatorConstraintInterface {
  validate(value: unknown, _args: ValidationArguments): boolean {
    if (typeof value !== 'string') return false;
    return UUID_V4_REGEX.test(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid UUID v4 (e.g., "550e8400-e29b-41d4-a716-446655440000")`;
  }
}

/**
 * @IsUuidV4(validationOptions?)
 *
 * Validates that the field is a valid UUID v4 string.
 * Rejects other UUID versions (v1, v3, v5).
 *
 * @example
 * ```ts
 * @IsUuidV4()
 * userId: string;
 *
 * @IsUuidV4({ message: 'Invalid user ID format' })
 * id: string;
 * ```
 */
export function IsUuidV4(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isUuidV4',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsUuidV4Constraint,
    });
  };
}
