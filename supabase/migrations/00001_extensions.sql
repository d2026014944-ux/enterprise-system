-- ============================================================================
-- Migration 001: Extensions & Security Prerequisites
-- ============================================================================
-- Security Posture: Minimal extension surface area
-- Each extension is justified and documented. Unused extensions = attack surface.
-- ============================================================================

-- UUID generation (required for all primary keys)
-- Uses OS CSPRNG — not predictable like serial/sequence
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Cryptographic functions (HMAC, digest, encrypt)
-- Used for: API key hashing, data-at-rest encryption, signing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Row-Level Security enhancements
-- Enables: current_setting() for JWT claims extraction
CREATE EXTENSION IF NOT EXISTS "pgjwt";

-- Full-text search (if needed)
-- CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ⚠️ INTENTIONALLY EXCLUDED:
-- dblink      — enables cross-database exfiltration
-- postgres_fdw — enables foreign data access
-- file_fdl     — enables filesystem access
-- lo           — large objects bypass RLS
-- adminpack    — superuser filesystem access

-- ============================================================================
-- Security: Revoke dangerous public permissions
-- ============================================================================
-- Even though Supabase manages roles, we explicitly revoke
-- any default public access to extensions

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM anon;
REVOKE ALL ON SCHEMA public FROM authenticated;

-- Grant back only what's needed
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

COMMENT ON SCHEMA public IS 'Application schema — all access controlled via RLS';
