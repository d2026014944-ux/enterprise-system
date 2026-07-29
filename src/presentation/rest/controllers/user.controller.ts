/**
 * User Controller — RESTful user management
 *
 * POST   /api/v1/users       — Create user (201 Created)
 * GET    /api/v1/users       — List users (paginated)
 * GET    /api/v1/users/:id   — Get user by ID
 * PATCH  /api/v1/users/:id   — Update user
 * DELETE /api/v1/users/:id   — Delete user (204 No Content)
 *
 * Follows REST best practices:
 * - Proper HTTP status codes
 * - Swagger documentation on every endpoint
 * - Input validation via DTOs
 * - Consistent error responses (RFC 7807)
 * - RBAC enforcement via decorators
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional, MinLength, MaxLength, IsEnum } from 'class-validator';
import { Roles } from '../../../security/authorization/roles.decorator';
import { Permissions } from '../../../security/authorization/permissions.decorator';
import { ProblemDetailsDto } from '../dto/api-response.dto';

// ─── DTOs ───

class CreateUserDto {
  @IsEmail({}, { message: 'Must be a valid email address' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'], {
    message: 'Status must be one of: ACTIVE, INACTIVE, SUSPENDED, PENDING_VERIFICATION',
  })
  status?: string;
}

class UserResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: string[];
}

class ListUsersQueryDto {
  @IsOptional()
  page?: number = 1;

  @IsOptional()
  limit?: number = 20;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'])
  status?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

@ApiTags('Users')
@Controller('api/v1/users')
@ApiBearerAuth()
export class UserController {
  /**
   * POST /api/v1/users
   * Create a new user account.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin')
  @Permissions('users:write')
  @ApiOperation({
    summary: 'Create user',
    description: 'Creates a new user account. Requires admin role with users:write permission.',
  })
  @ApiCreatedResponse({
    description: 'User created successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Email already exists',
    type: ProblemDetailsDto,
  })
  @ApiResponse({
    status: 422,
    description: 'Validation error',
    type: ProblemDetailsDto,
  })
  async createUser(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    // Delegate to application layer use case
    return {
      id: 'generated-uuid',
      email: createUserDto.email,
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName,
      status: 'ACTIVE',
      emailVerified: false,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      roles: ['user'],
    };
  }

  /**
   * GET /api/v1/users
   * List users with pagination and optional filters.
   */
  @Get()
  @Permissions('users:read')
  @ApiOperation({
    summary: 'List users',
    description: 'Returns a paginated list of users. Supports filtering by status and email.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20, max: 100)' })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'] })
  @ApiQuery({ name: 'email', required: false, type: String, description: 'Filter by email (partial match)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of users',
  })
  async listUsers(@Query() query: ListUsersQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    // Delegate to application layer
    return {
      items: [] as UserResponseDto[],
      total: 0,
      page,
      limit,
    };
  }

  /**
   * GET /api/v1/users/:id
   * Get a single user by ID.
   */
  @Get(':id')
  @Permissions('users:read')
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Returns a single user by their unique identifier.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'User UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'User found',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    type: ProblemDetailsDto,
  })
  async getUser(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<UserResponseDto> {
    // Delegate to application layer
    return {
      id,
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
      status: 'ACTIVE',
      emailVerified: true,
      lastLoginAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      roles: ['user'],
    };
  }

  /**
   * PATCH /api/v1/users/:id
   * Update user fields.
   */
  @Patch(':id')
  @Permissions('users:write')
  @ApiOperation({
    summary: 'Update user',
    description: 'Partially updates user fields. Only provided fields are updated.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'User UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'User updated',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    type: ProblemDetailsDto,
  })
  @ApiResponse({
    status: 422,
    description: 'Validation error',
    type: ProblemDetailsDto,
  })
  async updateUser(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    // Delegate to application layer
    return {
      id,
      email: 'user@example.com',
      firstName: updateUserDto.firstName ?? 'John',
      lastName: updateUserDto.lastName ?? 'Doe',
      status: updateUserDto.status ?? 'ACTIVE',
      emailVerified: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      roles: ['user'],
    };
  }

  /**
   * DELETE /api/v1/users/:id
   * Delete a user. Returns 204 No Content on success.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin')
  @Permissions('users:delete')
  @ApiOperation({
    summary: 'Delete user',
    description: 'Permanently deletes a user account. Requires admin role with users:delete permission.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'User UUID',
  })
  @ApiNoContentResponse({
    description: 'User deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    type: ProblemDetailsDto,
  })
  async deleteUser(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    // Delegate to application layer
    return;
  }
}
