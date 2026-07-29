import 'reflect-metadata';
import { validate, type ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Result, type DomainError } from '../result';

/**
 * Metadata key for the @ValidateInput decorator.
 */
export const VALIDATE_METADATA_KEY = Symbol('VALIDATE_METADATA');

/**
 * Validation configuration.
 */
export interface ValidateMetadata {
  /** The DTO class to validate against */
  dtoClass: new () => object;
  /** Whether to strip unknown properties */
  stripUnknown?: boolean;
  /** Whether to skip validation if input is already an instance of the DTO class */
  skipIfInstance?: boolean;
}

/**
 * @ValidateInput() — Automatic input validation decorator.
 *
 * Validates the first argument of the decorated method against a DTO class
 * using class-validator. Returns a Result.fail with structured errors
 * if validation fails.
 *
 * Usage:
 * ```ts
 * @ValidateInput({ dtoClass: CreateUserDto })
 * async execute(dto: CreateUserDto): Promise<Result<UserDTO>> {
 *   // dto is guaranteed to be valid here
 * }
 * ```
 */
export function ValidateInput(metadata: ValidateMetadata): MethodDecorator {
  return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(VALIDATE_METADATA_KEY, metadata, target, propertyKey);

    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const input = args[0];

      if (input === undefined || input === null) {
        return Result.fail({
          code: 'VALIDATION_ERROR',
          message: 'Request body is required.',
        });
      }

      // Transform plain object to DTO class instance
      let dtoInstance: object;
      if (metadata.skipIfInstance && input instanceof metadata.dtoClass) {
        dtoInstance = input;
      } else {
        dtoInstance = plainToInstance(metadata.dtoClass, input, {
          enableImplicitConversion: true,
          excludeExtraneousValues: metadata.stripUnknown ?? false,
        });
      }

      // Run class-validator validation
      const errors: ValidationError[] = await validate(dtoInstance, {
        whitelist: true,
        forbidNonWhitelisted: metadata.stripUnknown ?? false,
        forbidUnknownValues: true,
        validationError: { target: false, value: false },
      });

      if (errors.length > 0) {
        const formatted = formatValidationErrors(errors);
        return Result.fail({
          code: 'VALIDATION_ERROR',
          message: 'Input validation failed.',
          details: { errors: formatted },
        });
      }

      // Replace the first argument with the validated DTO instance
      args[0] = dtoInstance;
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Formats class-validator errors into a flat, API-friendly structure.
 * Inspired by Stripe's error response format.
 */
interface FormattedError {
  field: string;
  message: string;
  constraints: string[];
}

function formatValidationErrors(errors: ValidationError[], parentPath = ''): FormattedError[] {
  const result: FormattedError[] = [];

  for (const error of errors) {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.constraints) {
      result.push({
        field,
        message: Object.values(error.constraints).join('; '),
        constraints: Object.keys(error.constraints),
      });
    }

    // Recurse into nested validation errors
    if (error.children?.length) {
      result.push(...formatValidationErrors(error.children, field));
    }
  }

  return result;
}
