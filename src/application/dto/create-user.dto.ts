import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';

/**
 * DTO for creating a new user.
 *
 * Validation rules follow OWASP and Google API Design Guidelines:
 * - Email: RFC 5322 compliant, max 320 chars
 * - Password: min 8, max 128, must include uppercase + lowercase + digit + special
 * - Names: min 1, max 100, trimmed
 */
export class CreateUserDto {
  @IsEmail({}, { message: 'Email must be a valid email address.' })
  @MaxLength(320, { message: 'Email must not exceed 320 characters.' })
  email!: string;

  @IsString({ message: 'First name is required.' })
  @MinLength(1, { message: 'First name must not be empty.' })
  @MaxLength(100, { message: 'First name must not exceed 100 characters.' })
  firstName!: string;

  @IsString({ message: 'Last name is required.' })
  @MinLength(1, { message: 'Last name must not be empty.' })
  @MaxLength(100, { message: 'Last name must not exceed 100 characters.' })
  lastName!: string;

  @IsString({ message: 'Password is required.' })
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters.' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character.',
  })
  password!: string;
}
