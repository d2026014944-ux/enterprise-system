/**
 * Application Configuration
 *
 * Typed, validated configuration using Zod.
 * All environment variables are validated on startup — fail fast, fail loud.
 * Zero hardcoded secrets. Every value comes from the environment.
 */
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

// ─── Schema Definition ────────────────────────────────────

const appConfigSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test', 'staging'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  GLOBAL_PREFIX: z.string().default('api/v1'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
    .default('info'),
  API_VERSION: z.string().default('1.0.0'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

// ─── Validation ───────────────────────────────────────────

function validate(raw: Record<string, unknown>): AppConfig {
  const result = appConfigSchema.safeParse(raw);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `[AppConfig] Environment validation failed:\n${formatted}\n` +
        'Ensure all required environment variables are set.',
    );
  }

  return result.data;
}

// ─── Registration ─────────────────────────────────────────

export const appConfig = registerAs('app', (): AppConfig => {
  return validate(process.env);
});

export { appConfigSchema };
