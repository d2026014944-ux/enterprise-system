/**
 * AuthenticateUser Use Case — Unit Tests
 *
 * Tests authentication flow, invalid credentials, and account lockout.
 */

import { AuthenticateUserUseCase } from '../../../../src/application/use-cases/authenticate-user.use-case';
import { ErrorCode } from '../../../../src/domain/common/result';

const mockUserRepository = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
  save: jest.fn(),
};

const mockHashService = {
  hash: jest.fn(),
  compare: jest.fn(),
};

const mockTokenService = {
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
};

const mockSessionRepository = {
  create: jest.fn(),
  findByRefreshToken: jest.fn(),
  revoke: jest.fn(),
};

describe('AuthenticateUserUseCase', () => {
  let useCase: AuthenticateUserUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new AuthenticateUserUseCase(
      mockUserRepository as any,
      mockHashService as any,
      mockTokenService as any,
      mockSessionRepository as any,
    );
  });

  const mockUser = {
    id: { value: 'user-id-123' },
    email: { value: 'test@example.com' },
    passwordHash: { value: '$2a$12$hashed', isHashed: true },
    status: 'ACTIVE',
    emailVerified: true,
    recordLogin: jest.fn(),
    failedLoginAttempts: 0,
    lockedUntil: null,
    incrementFailedLogin: jest.fn(),
    resetFailedLogin: jest.fn(),
    isLocked: jest.fn().mockReturnValue(false),
  };

  // ─── Happy Path ───

  describe('successful authentication', () => {
    it('should return tokens on valid credentials', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockHashService.compare.mockResolvedValue(true);
      mockTokenService.generateAccessToken.mockResolvedValue('access-token');
      mockTokenService.generateRefreshToken.mockResolvedValue('refresh-token');
      mockSessionRepository.create.mockResolvedValue({});

      // Act
      const result = await useCase.execute({ email: 'test@example.com', password: 'Str0ng!Pass' });

      // Assert
      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    it('should record login timestamp', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockHashService.compare.mockResolvedValue(true);
      mockTokenService.generateAccessToken.mockResolvedValue('at');
      mockTokenService.generateRefreshToken.mockResolvedValue('rt');
      mockSessionRepository.create.mockResolvedValue({});

      await useCase.execute({ email: 'test@example.com', password: 'Str0ng!Pass' });

      expect(mockUser.recordLogin).toHaveBeenCalled();
    });
  });

  // ─── Invalid Credentials ───

  describe('invalid credentials', () => {
    it('should fail when user not found', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      const result = await useCase.execute({ email: 'nobody@example.com', password: 'Str0ng!Pass' });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe(ErrorCode.INVALID_CREDENTIALS);
    });

    it('should fail when password does not match', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockHashService.compare.mockResolvedValue(false);

      const result = await useCase.execute({ email: 'test@example.com', password: 'Wrong!Pass1' });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe(ErrorCode.INVALID_CREDENTIALS);
    });

    it('should fail when account is suspended', async () => {
      const suspendedUser = { ...mockUser, status: 'SUSPENDED' };
      mockUserRepository.findByEmail.mockResolvedValue(suspendedUser);

      const result = await useCase.execute({ email: 'test@example.com', password: 'Str0ng!Pass' });

      expect(result.isFailure).toBe(true);
    });
  });

  // ─── Account Lockout ───

  describe('account lockout', () => {
    it('should fail when account is locked', async () => {
      const lockedUser = { ...mockUser, isLocked: jest.fn().mockReturnValue(true) };
      mockUserRepository.findByEmail.mockResolvedValue(lockedUser);

      const result = await useCase.execute({ email: 'test@example.com', password: 'Str0ng!Pass' });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe(ErrorCode.ACCOUNT_LOCKED);
    });

    it('should increment failed attempts on wrong password', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockHashService.compare.mockResolvedValue(false);

      await useCase.execute({ email: 'test@example.com', password: 'Wrong1!x' });

      expect(mockUser.incrementFailedLogin).toHaveBeenCalled();
      expect(mockUserRepository.save).toHaveBeenCalledWith(mockUser);
    });

    it('should reset failed attempts on successful login', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockHashService.compare.mockResolvedValue(true);
      mockTokenService.generateAccessToken.mockResolvedValue('at');
      mockTokenService.generateRefreshToken.mockResolvedValue('rt');
      mockSessionRepository.create.mockResolvedValue({});

      await useCase.execute({ email: 'test@example.com', password: 'Str0ng!Pass' });

      expect(mockUser.resetFailedLogin).toHaveBeenCalled();
    });
  });
});
