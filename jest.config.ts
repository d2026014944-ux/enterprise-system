/**
 * Jest Configuration — Enterprise NestJS
 *
 * Features:
 *   - Path aliases matching tsconfig.json
 *   - Coverage thresholds >80%
 *   - Separate test environments for unit/integration/e2e
 *   - TypeScript support via ts-jest
 */

import type { Config } from 'jest';

const config: Config = {
  // ── Module Resolution ────────────────────────────────────
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  moduleNameMapper: {
    '^@domain/(.*)$': '<rootDir>/src/domain/$1',
    '^@application/(.*)$': '<rootDir>/src/application/$1',
    '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
    '^@presentation/(.*)$': '<rootDir>/src/presentation/$1',
    '^@security/(.*)$': '<rootDir>/src/security/$1',
    '^@observability/(.*)$': '<rootDir>/src/observability/$1',
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
  },

  // ── Transform ────────────────────────────────────────────
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
        diagnostics: true,
      },
    ],
  },

  // ── Test Matching ────────────────────────────────────────
  testMatch: [
    '<rootDir>/test/**/*.spec.ts',
    '<rootDir>/test/**/*.test.ts',
  ],

  // ── Coverage ─────────────────────────────────────────────
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.type.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: './coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'clover', 'json'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // ── Test Environment ─────────────────────────────────────
  testEnvironment: 'node',

  // ── Timeouts ─────────────────────────────────────────────
  testTimeout: 30_000,

  // ── Misc ─────────────────────────────────────────────────
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  clearMocks: true,
  restoreMocks: true,
  resetMocks: false,
};

export default config;
