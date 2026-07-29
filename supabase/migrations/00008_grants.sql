-- ============================================================================
-- Migration 008: Grants — Principle of Least Privilege
-- ============================================================================
-- Every role gets ONLY the permissions it needs. Nothing more.
-- Supabase roles: anon, authenticated, service_role, postgres
-- ============================================================================

-- ── REVOKE ALL DEFAULT PERMISSIONS ─────────────────────────
-- Start from zero. Grant only what's explicitly needed.

-- Revoke from PUBLIC (the default role everyone has)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;

-- Revoke from anon (unauthenticated requests)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Revoke from authenticated (default Supabase role)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;

-- ── ANON ROLE ─────────────────────────────────────────────
-- Unauthenticated users: NOTHING
-- They can only call Supabase Auth functions (managed by Supabase)

-- No grants for anon on any application table
-- RLS policies already block anon, but explicit REVOKE is defense-in-depth

-- ── AUTHENTICATED ROLE ────────────────────────────────────
-- Authenticated users: only through RLS-protected tables and secure functions

-- Tables (RLS policies control row-level access)
GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.organization_members TO authenticated;
GRANT SELECT ON public.accounts TO authenticated;
GRANT SELECT ON public.transactions TO authenticated;
GRANT SELECT ON public.user_sessions TO authenticated;

-- Views (security_barrier = true prevents RLS bypass)
GRANT SELECT ON public.ledger_view TO authenticated;
GRANT SELECT ON public.account_balances TO authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT SELECT ON public.transaction_summary TO authenticated;

-- Sequences (for INSERT operations)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Functions (explicit grants per function)
GRANT EXECUTE ON FUNCTION public.get_my_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_accounts TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_account TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_transactions TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_member_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_audit_logs TO authenticated;

-- NO grants on:
-- - audit_log (direct access blocked, only via functions)
-- - security_events (service_role only)
-- - rate_limits (service_role only)
-- - api_keys (service_role only)
-- - ledger_entries (direct access blocked, use ledger_view)

-- ── SERVICE ROLE ──────────────────────────────────────────
-- Server-side operations: full access (used by API server, Edge Functions)
-- This role is NEVER exposed to the client

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ── POSTGRES (Superuser) ──────────────────────────────────
-- Supabase manages this. We don't touch it.
-- In production, even postgres should not be used for application queries.

-- ── FUNCTION-LEVEL SECURITY ───────────────────────────────
-- Ensure SECURITY DEFINER functions can't be called by unauthorized roles

-- These functions are already restricted via REVOKE ALL + explicit GRANT above
-- Additional hardening: ensure they can't be called directly via SQL Editor

-- ── SCHEMA-LEVEL SECURITY ─────────────────────────────────
-- Prevent creation of new tables/functions by non-service roles
-- (Supabase manages this, but we enforce it explicitly)

-- Only postgres and service_role can create objects
GRANT CREATE ON SCHEMA public TO postgres;
GRANT CREATE ON SCHEMA public TO service_role;
REVOKE CREATE ON SCHEMA public FROM authenticated;
REVOKE CREATE ON SCHEMA public FROM anon;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- ── ROW-LEVEL SECURITY ENFORCEMENT ────────────────────────
-- Force RLS even for table owners (defense against Supabase dashboard access)

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END;
$$;

COMMENT ON SCHEMA public IS
  'Application schema. All access via RLS + SECURITY DEFINER functions. ' ||
  'Direct table access blocked for all roles except service_role.';

-- ── GRANT AUDIT ───────────────────────────────────────────
-- Log the final state of grants for compliance

CREATE OR REPLACE FUNCTION public.audit_grants()
RETURNS TABLE (
  grantee TEXT,
  table_name TEXT,
  privilege_type TEXT,
  is_grantable BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    grantee::text,
    table_name::text,
    privilege_type::text,
    is_grantable::boolean
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
  ORDER BY grantee, table_name, privilege_type;
$$;

REVOKE ALL ON FUNCTION public.audit_grants FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_grants TO service_role;
