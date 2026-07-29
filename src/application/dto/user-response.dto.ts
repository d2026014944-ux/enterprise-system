import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@domain/index';

/**
 * User Response DTO — the public representation of a user.
 *
 * Security: NEVER exposes password hash, internal version numbers,
 * or any field that could leak implementation details.
 * This is the contract between the API and its consumers.
 */
export class UserResponseDto {
  @ApiProperty({
    description: 'Unique user identifier',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  email!: string;

  @ApiProperty({
    description: 'User first name',
    example: 'Jane',
  })
  firstName!: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  lastName!: string;

  @ApiProperty({
    description: 'Full name (computed)',
    example: 'Jane Doe',
  })
  fullName!: string;

  @ApiProperty({
    description: 'Current account status',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  status!: UserStatus;

  @ApiProperty({
    description: 'Whether the email has been verified',
    example: true,
  })
  emailVerified!: boolean;

  @ApiPropertyOptional({
    description: 'Timestamp of last successful login',
    example: '2026-07-30T00:00:00.000Z',
  })
  lastLoginAt!: string | null;

  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2026-07-30T00:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'Last modification timestamp',
    example: '2026-07-30T00:00:00.000Z',
  })
  updatedAt!: string;

  @ApiPropertyOptional({
    description: 'Assigned role IDs',
    type: [String],
    example: ['role-uuid-1', 'role-uuid-2'],
  })
  roleIds!: string[];
}
