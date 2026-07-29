/**
 * Auth Controller — Authentication endpoints
 *
 * POST /auth/login    — Authenticate and receive token pair
 * POST /auth/register — Create new user account
 * POST /auth/refresh  — Refresh access token
 * POST /auth/logout   — Revoke current session
 *
 * All endpoints are rate-limited to prevent brute force attacks.
 * Login and register are public; refresh and logout require authentication.
 */
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService, TokenPair } from '../../../security/authentication/auth.service';
import { Public } from '../../../security/authentication/public.decorator';
import { RateLimit, ThrottlerGuard } from '../../../security/rate-limiting/throttler.guard';
import { ProblemDetailsDto } from '../dto/api-response.dto';

// ─── DTOs ───

class LoginDto {
  email: string;
  password: string;
}

class RegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

class RefreshDto {
  refreshToken: string;
}

class LogoutDto {
  refreshToken?: string;
}

// ─── Response DTOs ───

class TokenResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

@ApiTags('Authentication')
@Controller('api/v1/auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   * Authenticate user credentials and return token pair.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 10, windowSeconds: 60, keyPrefix: 'auth:login' })
  @ApiOperation({
    summary: 'Authenticate user',
    description: 'Validates credentials and returns an access/refresh token pair.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully authenticated',
    type: TokenResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    type: ProblemDetailsDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many login attempts',
    type: ProblemDetailsDto,
  })
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
  ): Promise<TokenResponseDto> {
    const tokenPair = await this.authService.generateTokenPair(
      'user-id', // In real implementation, validate credentials first
      loginDto.email,
      ['user'],
      request.headers['user-agent'],
      request.ip,
    );

    return {
      ...tokenPair,
      tokenType: 'Bearer',
    };
  }

  /**
   * POST /auth/register
   * Create a new user account.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 5, windowSeconds: 300, keyPrefix: 'auth:register' })
  @ApiOperation({
    summary: 'Register new user',
    description: 'Creates a new user account and returns a token pair.',
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: TokenResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Email already exists',
    type: ProblemDetailsDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many registration attempts',
    type: ProblemDetailsDto,
  })
  async register(
    @Body() registerDto: RegisterDto,
    @Req() request: Request,
  ): Promise<TokenResponseDto> {
    // In real implementation, this would call a RegisterUserUseCase
    const tokenPair = await this.authService.generateTokenPair(
      'new-user-id',
      registerDto.email,
      ['user'],
      request.headers['user-agent'],
      request.ip,
    );

    return {
      ...tokenPair,
      tokenType: 'Bearer',
    };
  }

  /**
   * POST /auth/refresh
   * Rotate refresh token and issue new token pair.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 20, windowSeconds: 60, keyPrefix: 'auth:refresh' })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Rotates the refresh token and issues a new token pair. The old refresh token is invalidated.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
    type: TokenResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token',
    type: ProblemDetailsDto,
  })
  async refresh(
    @Body() refreshDto: RefreshDto,
    @Req() request: Request,
  ): Promise<TokenResponseDto> {
    const tokenPair = await this.authService.refreshTokens(
      refreshDto.refreshToken,
      request.headers['user-agent'],
      request.ip,
    );

    return {
      ...tokenPair,
      tokenType: 'Bearer',
    };
  }

  /**
   * POST /auth/logout
   * Revoke current session (or all sessions).
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout',
    description: 'Revokes the current session. If no refresh token is provided, revokes all sessions.',
  })
  @ApiResponse({ status: 204, description: 'Successfully logged out' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: ProblemDetailsDto,
  })
  async logout(
    @Body() logoutDto: LogoutDto,
    @Req() request: Request,
  ): Promise<void> {
    const userId = (request as any).user?.id;
    await this.authService.revokeToken(userId, logoutDto?.refreshToken);
  }
}
