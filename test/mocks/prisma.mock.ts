/**
 * Prisma Client Mock — Type-safe mock for unit tests
 *
 * Provides a fully-typed mock of PrismaClient.
 * Each model delegate is a jest mock that can be configured per test.
 */

import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

export type PrismaMock = DeepMockProxy<PrismaClient>;

/**
 * Create a fresh Prisma mock for each test.
 * Usage:
 *   const prisma = createPrismaMock();
 *   prisma.user.findUnique.mockResolvedValue(mockUser);
 */
export function createPrismaMock(): PrismaMock {
  return mockDeep<PrismaClient>();
}

/**
 * Pre-built Prisma mock singleton (reset between tests).
 * Prefer createPrismaMock() for test isolation.
 */
let prismaMock: PrismaMock | null = null;

export function getPrismaMock(): PrismaMock {
  if (!prismaMock) {
    prismaMock = createPrismaMock();
  }
  return prismaMock;
}

export function resetPrismaMock(): void {
  prismaMock = null;
}
