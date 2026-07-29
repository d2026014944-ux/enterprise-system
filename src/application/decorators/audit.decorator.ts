import 'reflect-metadata';

/**
 * Metadata key for the @Audit decorator.
 */
export const AUDIT_METADATA_KEY = Symbol('AUDIT_METADATA');

/**
 * Audit configuration stored on the decorated method.
 */
export interface AuditMetadata {
  /** The action being performed (e.g., 'user.create', 'user.changeStatus') */
  action: string;
  /** The resource type (e.g., 'User', 'Role') */
  resource: string;
  /** Whether to include the command/query payload in the audit log */
  includePayload?: boolean;
  /** Whether to include the result in the audit log */
  includeResult?: boolean;
}

/**
 * @Audit() — Cross-cutting audit decorator for use case execute methods.
 *
 * Automatically logs who did what on which resource with what outcome.
 * Decorated methods are expected to have the signature:
 *   execute(input, context?) => Promise<Result<T, E>>
 *
 * The context parameter (when provided) should carry:
 *   - userId: the authenticated user performing the action
 *   - ipAddress: the client IP
 *   - userAgent: the client user agent
 *   - correlationId: request correlation ID
 *
 * Usage:
 * ```ts
 * @Audit({ action: 'user.create', resource: 'User' })
 * async execute(dto: CreateUserDto, context?: RequestContext): Promise<Result<UserDTO>> {
 *   // ...
 * }
 * ```
 */
export function Audit(metadata: AuditMetadata): MethodDecorator {
  return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(AUDIT_METADATA_KEY, metadata, target, propertyKey);

    const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const startTime = Date.now();
      const context = args.length > 1 ? (args[1] as RequestContext | undefined) : undefined;

      const auditEntry: AuditEntry = {
        action: metadata.action,
        resource: metadata.resource,
        userId: context?.userId,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        correlationId: context?.correlationId,
        timestamp: new Date().toISOString(),
        ...(metadata.includePayload ? { payload: sanitizePayload(args[0]) } : {}),
      };

      try {
        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - startTime;

        auditEntry.duration = duration;
        auditEntry.success = true;

        if (metadata.includeResult) {
          auditEntry.result = sanitizeResult(result);
        }

        emitAuditLog(auditEntry);
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        auditEntry.duration = duration;
        auditEntry.success = false;
        auditEntry.error = error instanceof Error ? error.message : 'Unknown error';

        emitAuditLog(auditEntry);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Request context passed through the application layer.
 */
export interface RequestContext {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}

/**
 * Structured audit log entry.
 */
interface AuditEntry {
  action: string;
  resource: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  timestamp: string;
  duration?: number;
  success?: boolean;
  error?: string;
  payload?: unknown;
  result?: unknown;
}

/**
 * Removes sensitive fields from audit payloads.
 * Never logs passwords, tokens, or secrets.
 */
function sanitizePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;

  const sanitized = { ...(payload as Record<string, unknown>) };
  const sensitiveFields = [
    'password',
    'passwordHash',
    'token',
    'refreshToken',
    'accessToken',
    'secret',
    'apiKey',
  ];

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Sanitizes result data for audit logging.
 * Strips large payloads, keeping only identifiers and status.
 */
function sanitizeResult(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result;

  const obj = result as Record<string, unknown>;

  // Handle Result pattern
  if ('isSuccess' in obj) {
    return {
      isSuccess: obj.isSuccess,
      value: obj.isSuccess ? sanitizeValue(obj.getValue?.() ?? obj.value) : undefined,
      error: obj.isFailure ? obj.getError?.()?.message ?? obj.error : undefined,
    };
  }

  return sanitizeValue(result);
}

function sanitizeValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;

  const obj = value as Record<string, unknown>;
  const allowed = ['id', 'email', 'status', 'fullName', 'userId', 'roleId'];
  const pick: Record<string, unknown> = {};

  for (const key of allowed) {
    if (key in obj) pick[key] = obj[key];
  }

  return Object.keys(pick).length > 0 ? pick : '[omitted]';
}

/**
 * Emits an audit log entry.
 * In production, this would be injected via a port; here we use console
 * as a safe default that infrastructure can override.
 */
function emitAuditLog(entry: AuditEntry): void {
  // Structured JSON logging — compatible with Winston, Datadog, CloudWatch
  console.info(JSON.stringify({ type: 'audit', ...entry }));
}
