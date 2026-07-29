import { User, UserStatus } from '@domain/index';
import { UserResponseDto } from '../dto/user-response.dto';
import { CreateUserDto } from '../dto/create-user.dto';

/**
 * User Mapper — bidirectional mapping between domain entities and DTOs.
 *
 * Mapping rules:
 * - toDTO: strips sensitive fields (password hash, version), converts dates to ISO strings
 * - toDomain: validates and constructs value objects from raw DTO data
 *
 * Mappers are stateless and side-effect free.
 */
export class UserMapper {
  /**
   * Converts a User aggregate to a public-facing response DTO.
   * Strips all internal/sensitive fields.
   */
  static toDTO(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id.toString();
    dto.email = user.email.value;
    dto.firstName = user.firstName;
    dto.lastName = user.lastName;
    dto.fullName = user.fullName;
    dto.status = user.status;
    dto.emailVerified = user.emailVerified;
    dto.lastLoginAt = user.lastLoginAt?.toISOString() ?? null;
    dto.createdAt = user.createdAt.toISOString();
    dto.updatedAt = user.updatedAt.toISOString();
    dto.roleIds = []; // Roles are loaded separately via UserAggregate
    return dto;
  }

  /**
   * Maps a CreateUserDto to domain-compatible creation parameters.
   * Returns the raw values — the domain's factory methods handle validation.
   */
  static toCreateParams(dto: CreateUserDto): {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  } {
    return {
      email: dto.email.trim().toLowerCase(),
      password: dto.password,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
    };
  }

  /**
   * Converts multiple users to DTOs.
   */
  static toDTOList(users: User[]): UserResponseDto[] {
    return users.map(UserMapper.toDTO);
  }
}
