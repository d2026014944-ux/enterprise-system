/**
 * Redis Configuration
 *
 * Supports standalone, sentinel, and cluster topologies.
 * All connection parameters are environment-driven.
 */
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const redisConfigSchema = z.object({
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
  REDIS_KEY_PREFIX: z.string().default('es:'),
  REDIS_SENTINEL_ENABLED: z.coerce.boolean().default(false),
  REDIS_SENTINEL_MASTER_NAME: z.string().default('mymaster'),
  REDIS_SENTINEL_NODES: z.string().optional(), // host1:port1,host2:port2
  REDIS_CLUSTER_ENABLED: z.coerce.boolean().default(false),
  REDIS_CLUSTER_NODES: z.string().optional(), // host1:port1,host2:port2
  REDIS_TLS_ENABLED: z.coerce.boolean().default(false),
  REDIS_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
});

export type RedisConfig = z.infer<typeof redisConfigSchema>;

function validate(raw: Record<string, unknown>): RedisConfig {
  const result = redisConfigSchema.safeParse(raw);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`[RedisConfig] Validation failed:\n${formatted}`);
  }

  return result.data;
}

export const redisConfig = registerAs('redis', (): RedisConfig => {
  return validate(process.env);
});

export { redisConfigSchema };

/**
 * Parse sentinel node list from comma-separated string.
 */
export function parseSentinelNodes(
  nodesStr?: string,
): Array<{ host: string; port: number }> {
  if (!nodesStr) return [];
  return nodesStr.split(',').map((node) => {
    const [host, portStr] = node.trim().split(':');
    return { host, port: parseInt(portStr, 10) || 26379 };
  });
}

/**
 * Parse cluster node list from comma-separated string.
 */
export function parseClusterNodes(
  nodesStr?: string,
): Array<{ host: string; port: number }> {
  if (!nodesStr) return [];
  return nodesStr.split(',').map((node) => {
    const [host, portStr] = node.trim().split(':');
    return { host, port: parseInt(portStr, 10) || 6379 };
  });
}
