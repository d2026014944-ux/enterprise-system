-- ============================================================================
-- Migration 006: RLS Policies — Comprehensive Security Layer
-- ============================================================================
-- This file consolidates and hardens ALL RLS policies.
-- Every policy follows the principle: DENY by default, ALLOW explicitly.
--
-- DEFENSE PHILOSOPHY:
--   Layer 1: JWT validation (Supabase Auth)
--   Layer 2: RLS policies (this file) — the LAST line of defense
--   Layer 3: Trigger validation (business logic)
--   Layer 4: Application-level checks
--
-- Even if Layers 1, 3, and 4 are bypassed, RLS MUST hold.
-- ============================================================================

-- ── API KEYS TABLE ────────────────────────────────────────
-- Service-to-service authentication

CREATE TABLE public.api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  key_hash      TEXT NOT NULL UNIQUE,            -- SHA-256 of the key (never store raw)
  key_prefix    TEXT NOT NULL,                    -- First 8 chars for identification
  scopes        JSONB NOT NULL DEFAULT '[]',     -- e.g., ["read:accounts", "write:transactions"]
  status        public.api_key_status NOT NULL DEFAULT 'active',
  expires_at    TIMESTAMPTZ,
  last_used_at  TIMESTAMPTZ,
  last_used_ip  INET,
  usage_count   BIGINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  revoked_at    TIMESTAMPTZ,
  revoked_by    UUID,

  CONSTRAINT api_key_scopes_valid CHECK (jsonb_typeof(scopes) = 'array')
);

CREATE INDEX idx_api_key_hash ON public.api_keys (key_hash) WHERE status = 'active';
CREATE INDEX idx_api_key_org ON public.api_keys (org_id, status);

-- RLS: Only service_role manages API keys
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_service_only"
  ON public.api_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "api_keys_no_authenticated"
  ON public.api_keys
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- ── SECURE LEDGER VIEW ────────────────────────────────────
-- Users access ledger through this view, not the raw table
-- The view enforces org isolation

CREATE OR REPLACE VIEW public.ledger_view
WITH (security_barrier = true)  -- CRITICAL: prevents RLS bypass via view
AS
SELECT
  le.id,
  le.transaction_id,
  le.account_id,
  le.entry_type,
  le.amount,
  le.currency,
  le.balance_after,
  le.description,
  le.created_at
FROM public.ledger_entries le
WHERE le.org_id = public.auth_org_id()
  AND NOT public.is_service_role();  -- Service role uses direct table

-- Grant access to the view only
GRANT SELECT ON public.ledger_view TO authenticated;

-- ── ACCOUNT BALANCE VIEW ──────────────────────────────────
-- Aggregated balance view (no raw ledger access)

CREATE OR REPLACE VIEW public.account_balances
WITH (security_barrier = true)
AS
SELECT
  a.id,
  a.org_id,
  a.name,
  a.type,
  a.status,
  a.currency,
  a.balance,
  a.created_at,
  a.updated_at
FROM public.accounts a
WHERE a.org_id = public.auth_org_id()
  AND a.status = 'active';

GRANT SELECT ON public.account_balances TO authenticated;

-- ── USER PROFILE VIEW ─────────────────────────────────────
-- Users can only see their own profile and org members

CREATE OR REPLACE VIEW public.user_profiles
WITH (security_barrier = true)
AS
SELECT
  au.id,
  au.email,
  au.raw_user_meta_data->>'full_name' AS full_name,
  au.raw_user_meta_data->>'avatar_url' AS avatar_url,
  au.created_at,
  au.last_sign_in_at,
  om.role AS org_role,
  om.joined_at AS org_joined_at
FROM auth.users au
JOIN public.organization_members om ON om.user_id = au.id
WHERE om.org_id = public.auth_org_id()
  AND om.is_active = true;

GRANT SELECT ON public.user_profiles TO authenticated;

-- ── TRANSACTION SUMMARY VIEW ──────────────────────────────
-- Read-only transaction view with org isolation

CREATE OR REPLACE VIEW public.transaction_summary
WITH (security_barrier = true)
AS
SELECT
  t.id,
  t.org_id,
  t.type,
  t.status,
  t.amount,
  t.currency,
  sa.name AS source_account_name,
  da.name AS dest_account_name,
  t.description,
  t.created_at,
  t.processed_at,
  t.created_by
FROM public.transactions t
LEFT JOIN public.accounts sa ON sa.id = t.source_account_id
LEFT JOIN public.accounts da ON da.id = t.dest_account_id
WHERE t.org_id = public.auth_org_id();

GRANT SELECT ON public.transaction_summary TO authenticated;

-- ── ADDITIONAL HARDENED POLICIES ──────────────────────────

-- Prevent anon role from accessing ANY application table
-- (Supabase anon key should never reach application data)

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('schema_migrations', '_prisma_migrations')
  LOOP
    EXECUTE format(
      'CREATE POLICY "anon_no_access_%I" ON public.%I FOR ALL TO anon USING (false) WITH CHECK (false)',
      r.tablename, r.tablename
    );
  END LOOP;
END;
$$;

-- ── POLICY DOCUMENTATION ──────────────────────────────────
-- Each table's RLS is documented here for audit purposes

COMMENT ON POLICY "org_select_own" ON public.organizations IS
  'Users can only SELECT their own organization. org_id extracted from JWT claim.';

COMMENT ON POLICY "accounts_select_org" ON public.accounts IS
  'Users can only SELECT accounts belonging to their organization. Prevents cross-tenant data access.';

COMMENT ON POLICY "transactions_select_org" ON public.transactions IS
  'Users can only SELECT transactions belonging to their organization.';

COMMENT ON POLICY "ledger_service_only" ON public.ledger_entries IS
  'Ledger is only accessible via service_role. Users access through secure view with org isolation.';

COMMENT ON POLICY "api_keys_service_only" ON public.api_keys IS
  'API keys are managed server-side only. Never exposed to client.';

-- ── RLS COVERAGE AUDIT FUNCTION ───────────────────────────
-- Returns tables that might be missing RLS

CREATE OR REPLACE FUNCTION public.audit_rls_coverage()
RETURNS TABLE (
  table_name TEXT,
  rls_enabled BOOLEAN,
  policy_count BIGINT,
  has_select_policy BOOLEAN,
  has_insert_policy BOOLEAN,
  has_update_policy BOOLEAN,
  has_delete_policy BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    c.relname::text,
    c.relrowsecurity,
    COUNT(p.polname),
    BOOL_OR(p.polcmd = 'r' OR p.polcmd = '*'),
    BOOL_OR(p.polcmd = 'a' OR p.polcmd = '*'),
    BOOL_OR(p.polcmd = 'w' OR p.polcmd = '*'),
    BOOL_OR(p.polcmd = 'd' OR p.polcmd = '*')
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_policy p ON p.polrelid = c.oid
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
  GROUP BY c.relname, c.relrowsecurity
  ORDER BY c.relrowsecurity, c.relname;
$$;

REVOKE ALL ON FUNCTION public.audit_rls_coverage FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_rls_coverage TO service_role;
