/**
 * Validation Pipe — Global input validation
 *
 * Uses class-transformer + class-validator for request validation.
 *
 * Configuration:
 * - whitelist: true — strips unknown properties (OWASP injection prevention)
 * - forbidNonWhitelisted: true — rejects requests with unknown properties
 * - transform: true — transforms payloads to DTO instances
 * - disableErrorMessages: false — provides detailed validation errors
 *
 * Returns RFC 7807 Problem Details with field-level errors.
 */
import {
  ValidationPipe as NestValidationPipe,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { ErrorCode } from '../../../domain/common/result';

export function createValidationPipe(): NestValidationPipe {
  return new NestValidationPipe({
    // Strip unknown properties — OWASP injection prevention
    whitelist: true,
    // Reject requests with unknown properties
    forbidNonWhitelisted: true,
    // Transform payloads to DTO instances
    transform: true,
    // Use implicit type conversion (e.g., string "1" → number 1)
    transformOptions: {
      enableImplicitConversion: true,
    },
    // Provide detailed error messages
    disableErrorMessages: false,
    // Custom exception factory for RFC 7807 format
    exceptionFactory: (errors) => {
      const fieldErrors = errors.map((error) => ({
        field: error.property,
        message: Object.values(error.constraints ?? {}).join('; '),
        value: error.value,
      }));

      return new BadRequestException({
        type: 'https://enterprise.system/errors/validation',
        title: 'Validation Error',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: 'The request body contains invalid fields.',
        code: ErrorCode.VALIDATION_ERROR,
        errors: fieldErrors,
      });
    },
  });
}
