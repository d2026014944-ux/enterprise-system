import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsEnum } from 'class-validator';
import { UserStatus } from '@domain/index';

/**
 * DTO for partial user updates.
 * All fields are optional — only provided fields are updated.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsEmail({}, { message: 'Email must be a valid email address.' })
  @MaxLength(320, { message: 'Email must not exceed 320 characters.' })
  email?: string;

  @IsOptional()
  @IsString({ message: 'First name must be a string.' })
  @MinLength(1, { message: 'First name must not be empty.' })
  @MaxLength(100, { message: 'First name must not exceed 100 characters.' })
  firstName?: string;

  @IsOptional()
  @IsString({ message: 'Last name must be a string.' })
  @MinLength(1, { message: 'Last name must not be empty.' })
  @MaxLength(100, { message: 'Last name must not exceed 100 characters.' })
  lastName?: string;

  @IsOptional()
  @IsEnum(UserStatus, { message: `Status must be one of: ${Object.values(UserStatus).join(', ')}` })
  status?: UserStatus;
}
