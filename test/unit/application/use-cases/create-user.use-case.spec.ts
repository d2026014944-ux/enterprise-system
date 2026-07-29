/**
 * CreateUser Use Case — Unit Tests
 *
 * Tests with mocked ports (repository, event publisher).
 * Covers: happy path, duplicate email, validation failure, event publishing.
 */

import { CreateUserUseCase } from '../../../../src/application/use-cases/create-user.use-case';
import { Result, ErrorCode } from '../../../../src/domain/common/result';
import { Email } from '../../../../src/domain/value-objects/email.vo';
import { Password } from '../../../../src/domain/value-objects/password.vo';
import { UserId } from '../../../../src/domain/value-objects/user-id.vo';

// Mock ports
const mockUserRepository = {
  findByEmail: jest.fn(),
  save: jest.fn(),
  findById: jest.fn(),
  delete: jest.fn(),
};

const mockEventPublisher = {
  publish: jest.fn(),
};

const mockHashService = {
  hash: jest.fn(),
  compare: jest.fn(),
};

describe('CreateUserUseCase', () => {
  let useCase: CreateUserUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new CreateUserUseCase(
      mockUserRepository as any,
      mockEventPublisher as any,
      mockHashService as any,
    );
  });

  // ─── Happy Path ───

  describe('happy path', () => {
    it('should create a user successfully', async () => {
      // Arrange
      const dto = {
        email: 'new@example.com',
        password: 'Str0ng!Pass',
        firstName: 'Jane',
        lastName: 'Doe',
      };

      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockHashService.hash.mockResolvedValue('$2a$12$hashed');
      mockUserRepository.save.mockImplementation((user: any) => Promise.resolve(user));

      // Act
      const result = await useCase.execute(dto);

      // Assert
      expect(result.isSuccess).toBe(true);
      const user = result.getValue();
      expect(user.email.value).toBe('new@example.com');
      expect(user.firstName).toBe('Jane');
      expect(mockUserRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should hash the password before saving', async () => {
      const dto = { email: 'new@example.com', password: 'Str0ng!Pass', firstName: 'Jane', lastName: 'Doe' };
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockHashService.hash.mockResolvedValue('$2a$12$hashed');
      mockUserRepository.save.mockImplementation((user: any) => Promise.resolve(user));

      await useCase.execute(dto);

      expect(mockHashService.hash).toHaveBeenCalledWith('Str0ng!Pass');
    });

    it('should publish UserCreated event', async () => {
      const dto = { email: 'new@example.com', password: 'Str0ng!Pass', firstName: 'Jane', lastName: 'Doe' };
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockHashService.hash.mockResolvedValue('$2a$12$hashed');
      mockUserRepository.save.mockImplementation((user: any) => Promise.resolve(user));

      await useCase.execute(dto);

      expect(mockEventPublisher.publish).toHaveBeenCalledTimes(1);
      expect(mockEventPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ constructor: expect.any(Function) }),
      );
    });
  });

  // ─── Duplicate Email ───

  describe('duplicate email', () => {
    it('should fail when email already exists', async () => {
      // Arrange
      const dto = { email: 'existing@example.com', password: 'Str0ng!Pass', firstName: 'Jane', lastName: 'Doe' };
      mockUserRepository.findByEmail.mockResolvedValue({ id: 'existing-id' });

      // Act
      const result = await useCase.execute(dto);

      // Assert
      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe(ErrorCode.USER_ALREADY_EXISTS);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });
  });

  // ─── Validation Failure ───

  describe('validation failure', () => {
    it('should fail when email is invalid', async () => {
      const dto = { email: 'not-an-email', password: 'Str0ng!Pass', firstName: 'Jane', lastName: 'Doe' };
      const result = await useCase.execute(dto);
      expect(result.isFailure).toBe(true);
    });

    it('should fail when password is too weak', async () => {
      const dto = { email: 'new@example.com', password: 'weak', firstName: 'Jane', lastName: 'Doe' };
      const result = await useCase.execute(dto);
      expect(result.isFailure).toBe(true);
    });
  });

  // ─── Event not published on failure ───

  describe('event isolation', () => {
    it('should not publish events when creation fails', async () => {
      const dto = { email: 'existing@example.com', password: 'Str0ng!Pass', firstName: 'Jane', lastName: 'Doe' };
      mockUserRepository.findByEmail.mockResolvedValue({ id: 'existing-id' });

      await useCase.execute(dto);

      expect(mockEventPublisher.publish).not.toHaveBeenCalled();
    });
  });
});
