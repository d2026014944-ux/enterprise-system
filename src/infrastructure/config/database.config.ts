/**
 * Database Configuration
 *
 * PostgreSQL connection with pooling, SSL, and Prisma-specific settings.
 * Connection pool is sized for the expected concurrency model.
 */
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const databaseConfigSchema = z.object({
  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid PostgreSQL connection URL')
    .startsWith('postgresql://', 'DATABASE_URL must start with postgresql://'),
  DATABASE_POOL_MIN: z.coerce.number().int().min(0).default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),
  DATABASE_SSL: z.coerce.boolean().default(false),
  DATABASE_SSL_REJECT_UNAUTHORIZED: z.coerce.boolean().default(true),
  DATABASE_LOG_QUERIES: z.coerce.boolean().default(false),
  DATABASE_SLOW_QUERY_MS: z.coerce.number().int().positive().default(500),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

function validate(raw: Record<string, unknown>): DatabaseConfig {
  const result = databaseConfigSchema.safeParse(raw);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `[DatabaseConfig] Validation failed:\n${formatted}\n` +
        'Check your DATABASE_URL and pool settings.',
    );
  }

  return result.data;
}

export const databaseConfig = registerAs('database', (): DatabaseConfig => {
  return validate(process.env);
});

export { databaseConfigSchema };

/**
 * Build Prisma datasource URL with connection pool parameters.
 * Appends pool size and connection timeout to the URL.
 */
export function buildPrismaUrl(config: DatabaseConfig): string {
  const url = new URL(config.DATABASE_URL);

  url.searchParams.set('connection_limit', String(config.DATABASE_POOL_MAX));
  url.searchParams.set('pool_timeout', '10');

  if (config.DATABASE_SSL) {
    url.searchParams.set('sslmode', 'require');
    if (!config.DATABASE_SSL_REJECT_UNAUTHORIZED) {
      url.searchParams.set('sslcert', '');
      url.searchParams.set('sslkey', '');
      url.searchParams.set('sslrootcert', '');
    }
  }

  return url.toString();
}
