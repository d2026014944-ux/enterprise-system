-- ============================================================================
-- Migration 002: Custom Types & Enums
-- ============================================================================
-- Security: Enums prevent injection of arbitrary values
-- Every status transition is controlled by application logic, not user input
-- ============================================================================

-- ── Organization / Tenant ─────────────────────────────────
CREATE TYPE public.org_plan AS ENUM (
  'free',
  'starter',
  'professional',
  'enterprise'
);

CREATE TYPE public.org_status AS ENUM (
  'active',
  'suspended',
  'cancelled',
  'pending_verification'
);

-- ── User ──────────────────────────────────────────────────
CREATE TYPE public.user_status AS ENUM (
  'active',
  'inactive',
  'suspended',
  'pending_verification',
  'deactivated'
);

CREATE TYPE public.user_role AS ENUM (
  'owner',
  'admin',
  'member',
  'viewer',
  'billing'
);

-- ── Financial ─────────────────────────────────────────────
CREATE TYPE public.account_type AS ENUM (
  'checking',
  'savings',
  'credit',
  'escrow',
  'fee'
);

CREATE TYPE public.account_status AS ENUM (
  'active',
  'frozen',
  'closed',
  'pending_verification'
);

CREATE TYPE public.transaction_type AS ENUM (
  'debit',
  'credit',
  'transfer',
  'fee',
  'refund',
  'adjustment'
);

CREATE TYPE public.transaction_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'reversed',
  'cancelled'
);

-- ── Audit ─────────────────────────────────────────────────
CREATE TYPE public.audit_action AS ENUM (
  'create',
  'read',
  'update',
  'delete',
  'login',
  'logout',
  'access_denied',
  'export',
  'import',
  'approve',
  'reject'
);

CREATE TYPE public.security_event_type AS ENUM (
  'rls_violation',
  'privilege_escalation_attempt',
  'suspicious_query',
  'rate_limit_exceeded',
  'invalid_token',
  'session_hijack_attempt',
  'data_export',
  'bulk_operation',
  'schema_change',
  'role_change'
);

-- ── API Keys ──────────────────────────────────────────────
CREATE TYPE public.api_key_status AS ENUM (
  'active',
  'revoked',
  'expired'
);

COMMENT ON TYPE public.security_event_type IS
  'Security event types for intrusion detection. Each type triggers specific alerting rules.';
