/**
 * JWT Configuration
 *
 * Separate secrets for access and refresh tokens.
 * Token TTLs are configurable per environment.
 * Secrets MUST come from environment — never hardcoded.
 */
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const jwtConfigSchema = z.object({
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  JWT_ISSUER: z.string().default('enterprise-system'),
  JWT_AUDIENCE: z.string().default('enterprise-api'),
});

export type JwtConfig = z.infer<typeof jwtConfigSchema>;

function validate(raw: Record<string, unknown>): JwtConfig {
  const result = jwtConfigSchema.safeParse(raw);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `[JwtConfig] Validation failed:\n${formatted}\n` +
        'JWT secrets are required and must be at least 32 characters.',
    );
  }

  return result.data;
}

export const jwtConfig = registerAs('jwt', (): JwtConfig => {
  return validate(process.env);
});

export { jwtConfigSchema };
