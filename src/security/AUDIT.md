# Security Layer — Audit Report

## Architecture Overview

The security layer implements defense-in-depth with four distinct security domains:

1. **Authentication** — JWT-based stateless auth with stateful refresh tokens
2. **Authorization** — Role-based (RBAC) + fine-grained permission access control
3. **Encryption** — AES-256-GCM for data at rest with key rotation
4. **Rate Limiting** — Per-IP and per-user throttling with tiered limits

## OWASP Top 10 Coverage

| OWASP Category | Mitigation | Implementation |
|---|---|---|
| A01: Broken Access Control | RBAC + fine-grained permissions | `RolesGuard`, `PermissionsGuard` |
| A02: Cryptographic Failures | AES-256-GCM, bcrypt, HS256 | `EncryptionService`, `AuthService` |
| A03: Injection | Input validation (whitelist) | `ValidationPipe` (class-validator) |
| A04: Insecure Design | Zero-trust, validate everything | All guards, JWT strategy |
| A05: Security Misconfiguration | Env-based config, no defaults | `ConfigService` throughout |
| A06: Vulnerable Components | Pinned versions | `package.json` |
| A07: Auth Failures | Rate limiting, token rotation | `ThrottlerGuard`, `AuthService` |
| A08: Data Integrity Failures | JWT signatures, GCM auth tags | `JwtStrategy`, `EncryptionService` |
| A09: Logging Failures | Structured logging, redaction | `LoggingInterceptor` |
| A10: SSRF | No user-controlled URLs | N/A |

## Implementation Details

### 1. JWT Strategy (`jwt.strategy.ts`)
- **Token extraction**: Bearer header via `ExtractJwt.fromAuthHeaderAsBearerToken()`
- **Algorithm**: HS256 (symmetric, suitable for same-service auth)
- **Validation chain**: Signature → Expiration → Revocation check → User status
- **Issuer/Audience**: Configurable, prevents token misuse across services
- **Expired tokens**: Handled gracefully with RFC 7807 response

### 2. Auth Guard (`auth.guard.ts`)
- **Public route bypass**: `@Public()` decorator via Reflector
- **Error format**: RFC 7807 Problem Details on all failures
- **Token info extraction**: Maps passport error messages to domain errors
- **Global registration**: Applied via `APP_GUARD` token

### 3. Auth Service (`auth.service.ts`)
- **Token generation**: Access (15min) + Refresh (7d) pair
- **Refresh token storage**: bcrypt-hashed in `sessions` table
- **Token rotation**: Old refresh token invalidated on use (one-time use)
- **Reuse detection**: If a revoked refresh token is presented, ALL sessions are revoked
- **Cleanup**: Expired session garbage collection method

### 4. Roles Guard (`roles.guard.ts`)
- **Metadata-driven**: Reads required roles from `@Roles()` decorator
- **Multiple roles**: OR logic (user needs at least one)
- **No roles = public**: If no `@Roles()` decorator, access is allowed
- **Error response**: 403 with required vs. actual roles

### 5. Permissions Guard (`permissions.guard.ts`)
- **Fine-grained**: `resource:action` format (e.g., `users:read`)
- **AND logic**: User must have ALL required permissions
- **Missing permissions**: Listed in error response for debugging
- **Aggregated from roles**: Permissions from all user roles are merged

### 6. Encryption Service (`encryption.service.ts`)
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **IV**: 96-bit random per operation (never reused)
- **Auth tag**: 128-bit (detects tampering)
- **Key rotation**: Multiple key versions, encrypt with current, decrypt with any
- **Secure random**: `crypto.randomBytes()` for token generation
- **Timing-safe comparison**: `crypto.timingSafeEqual()` for auth tags

### 7. Rate Limiting (`throttler.guard.ts`)
- **Default**: 100 req/min per IP
- **Auth endpoints**: 10 req/min (brute force protection)
- **Per-user**: 1000 req/min for authenticated users
- **Response headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- **Retry-After**: Included when rate limited
- **Cleanup**: Expired entries purged every 5 minutes

## Security Invariants

1. **Passwords are NEVER logged or serialized** — `Password` VO enforces this
2. **Refresh tokens are stored as bcrypt hashes** — DB compromise doesn't expose tokens
3. **Token rotation is mandatory** — Each refresh invalidates the old token
4. **All errors use RFC 7807** — Consistent, no stack traces in production
5. **Global guards apply to ALL routes** — No accidental unprotected endpoints
6. **Sensitive fields are redacted in logs** — Passwords, tokens, keys never appear

## Known Limitations

1. **In-memory rate limit store**: Production should use Redis for distributed systems
2. **Single encryption key derivation**: Production should integrate with KMS (AWS KMS, Vault)
3. **No MFA**: Should be added as an additional authentication factor
4. **No API key rotation**: API keys in schema but rotation not implemented

## Recommendations for Production

1. Replace in-memory rate limit store with Redis
2. Integrate with external KMS for encryption key management
3. Add multi-factor authentication (TOTP, WebAuthn)
4. Implement account lockout after N failed attempts
5. Add IP-based anomaly detection
6. Implement audit logging for all security events
