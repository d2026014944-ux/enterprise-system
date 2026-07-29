-- ============================================================================
-- Migration 003: Security Infrastructure
-- ============================================================================
-- This is the FOUNDATION of all security. Implements:
--   1. Immutable audit log (append-only, no UPDATE/DELETE)
--   2. Security event log (intrusion detection)
--   3. Session tracking with fingerprinting
--   4. Rate limiting infrastructure
--   5. JWT claim extraction helpers
--
-- THREAT MODEL:
--   Attacker has: stolen JWT, SQL Editor access, leaked service_role key
--   Attacker wants: data exfiltration, privilege escalation, audit tampering
--   Defense: immutable logs, RLS on audit tables, trigger-based integrity
-- ============================================================================

-- ── 1. IMMUTABLE AUDIT LOG ────────────────────────────────
-- No UPDATE or DELETE allowed. Ever. Period.
-- This is the chain of custody for every data access.

CREATE TABLE public.audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- WHO
  actor_id      UUID,                          -- auth.uid() or NULL for system
  actor_email   TEXT,                           -- denormalized for fast lookups
  actor_ip      INET,
  actor_role    TEXT,
  -- WHAT
  action        public.audit_action NOT NULL,
  table_name    TEXT NOT NULL,
  record_id     UUID,
  -- CHANGE DATA CAPTURE
  old_data      JSONB,                         -- snapshot before change
  new_data      JSONB,                         -- snapshot after change
  changed_fields TEXT[],                        -- explicit field diff
  -- CONTEXT
  request_id    TEXT,                           -- X-Request-Id header
  correlation_id TEXT,                          -- X-Correlation-Id
  user_agent    TEXT,
  -- INTEGRITY
  row_hash      TEXT NOT NULL,                  -- SHA-256 of row content
  prev_hash     TEXT,                           -- chain: hash of previous audit row
  -- TIMESTAMPS
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent any modification
  CONSTRAINT audit_log_immutable CHECK (true)
);

-- Indexes for audit queries
CREATE INDEX idx_audit_log_actor ON public.audit_log (actor_id, created_at DESC);
CREATE INDEX idx_audit_log_table ON public.audit_log (table_name, created_at DESC);
CREATE INDEX idx_audit_log_action ON public.audit_log (action, created_at DESC);
CREATE INDEX idx_audit_log_record ON public.audit_log (table_name, record_id);
CREATE INDEX idx_audit_log_time ON public.audit_log (created_at DESC);

-- BRUTE FORCE PROTECTION: Block all UPDATE/DELETE on audit_log
CREATE OR REPLACE FUNCTION public.prevent_audit_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER                    -- Must be definer to enforce across all roles
SET search_path = ''                -- Prevent search_path injection
AS $$
BEGIN
  RAISE EXCEPTION 'SECURITY VIOLATION: Audit log is immutable. UPDATE/DELETE operations are forbidden.'
    USING ERRCODE = '42501',        -- insufficient_privilege
          DETAIL = jsonb_build_object(
            'table', TG_TABLE_NAME,
            'operation', TG_OP,
            'user', current_setting('request.jwt.claim.sub', true),
            'timestamp', now()
          )::text;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_modification();

-- RLS: Only service_role can read audit logs (not even authenticated users)
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_service_read"
  ON public.audit_log
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "audit_log_no_insert"
  ON public.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (false);  -- Only functions can insert

-- ── 2. SECURITY EVENT LOG ─────────────────────────────────
-- Intrusion detection. Anomalies here trigger alerts.

CREATE TABLE public.security_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    public.security_event_type NOT NULL,
  severity      TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  -- WHO (may be anonymous for some events)
  actor_id      UUID,
  actor_ip      INET,
  actor_email   TEXT,
  -- WHAT
  description   TEXT NOT NULL,
  metadata      JSONB DEFAULT '{}',
  -- CONTEXT
  table_name    TEXT,
  query_text    TEXT,                           -- sanitized query (no params)
  request_id    TEXT,
  -- RESPONSE
  action_taken  TEXT,                           -- 'blocked', 'logged', 'alerted'
  resolved      BOOLEAN DEFAULT false,
  resolved_by   UUID,
  resolved_at   TIMESTAMPTZ,
  -- TIMESTAMPS
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_security_events_type ON public.security_events (event_type, created_at DESC);
CREATE INDEX idx_security_events_actor ON public.security_events (actor_id, created_at DESC);
CREATE INDEX idx_security_events_severity ON public.security_events (severity, created_at DESC)
  WHERE resolved = false;

-- RLS: Only service_role can access security events
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "security_events_service_only"
  ON public.security_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 3. RATE LIMITING INFRASTRUCTURE ───────────────────────
-- Token bucket rate limiter at the database level
-- Defense layer: even if API rate limiting is bypassed, DB enforces limits

CREATE TABLE public.rate_limits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key           TEXT NOT NULL,                  -- e.g., 'user:{uid}:write' or 'ip:{ip}:rpc'
  tokens        INTEGER NOT NULL DEFAULT 0,
  max_tokens    INTEGER NOT NULL,
  refill_rate   INTEGER NOT NULL,               -- tokens per interval
  refill_interval INTERVAL NOT NULL DEFAULT '1 minute',
  last_refill   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rate_limits_key_unique UNIQUE (key)
);

-- No RLS — accessed only via SECURITY DEFINER functions
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_limits_no_direct_access"
  ON public.rate_limits
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- ── 4. SESSION TRACKING ───────────────────────────────────
-- Track active sessions for anomaly detection

CREATE TABLE public.user_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  session_id    TEXT NOT NULL UNIQUE,            -- from JWT jti claim
  ip_address    INET,
  user_agent    TEXT,
  device_fingerprint TEXT,
  -- Anomaly detection
  login_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  revoke_reason TEXT,
  -- Geolocation (coarse, for anomaly detection)
  country_code  TEXT,
  city          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user ON public.user_sessions (user_id, last_active DESC);
CREATE INDEX idx_sessions_active ON public.user_sessions (user_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions_own_only"
  ON public.user_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ── 5. HELPER FUNCTIONS ───────────────────────────────────

-- Extract JWT claims safely (never returns NULL for required claims)
CREATE OR REPLACE FUNCTION public.auth_uid()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid,
    NULLIF(current_setting('role', true), '')::uuid
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claim.role', true),
    'authenticated'
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.org_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT current_setting('role', true) = 'service_role';
$$;

-- Rate limiter check (token bucket algorithm)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_max_tokens INTEGER DEFAULT 100,
  p_refill_rate INTEGER DEFAULT 10
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tokens INTEGER;
BEGIN
  -- Try to consume a token
  UPDATE public.rate_limits
  SET
    tokens = CASE
      WHEN last_refill < now() - refill_interval
      THEN p_max_tokens - 1  -- Refill and consume
      ELSE tokens - 1        -- Just consume
    END,
    last_refill = CASE
      WHEN last_refill < now() - refill_interval
      THEN now()
      ELSE last_refill
    END,
    updated_at = now()
  WHERE key = p_key
    AND tokens > 0
  RETURNING tokens INTO v_tokens;

  IF v_tokens IS NULL THEN
    -- No row or no tokens — try to create/refill
    INSERT INTO public.rate_limits (key, tokens, max_tokens, refill_rate, last_refill)
    VALUES (p_key, p_max_tokens - 1, p_max_tokens, p_refill_rate, now())
    ON CONFLICT (key) DO UPDATE
    SET tokens = CASE
      WHEN rate_limits.last_refill < now() - rate_limits.refill_interval
      THEN rate_limits.max_tokens - 1
      ELSE rate_limits.tokens
    END,
    last_refill = CASE
      WHEN rate_limits.last_refill < now() - rate_limits.refill_interval
      THEN now()
      ELSE rate_limits.last_refill
    END;

    -- Check if we got a token
    SELECT tokens INTO v_tokens FROM public.rate_limits WHERE key = p_key;
    RETURN v_tokens >= 0;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.check_rate_limit IS
  'Token bucket rate limiter. Returns true if request is allowed, false if rate limited.';

-- Audit log writer (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_action public.audit_action,
  p_table_name TEXT,
  p_record_id UUID DEFAULT NULL,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
  v_hash TEXT;
  v_prev_hash TEXT;
  v_changed TEXT[];
BEGIN
  -- Calculate changed fields
  IF p_old_data IS NOT NULL AND p_new_data IS NOT NULL THEN
    SELECT array_agg(key) INTO v_changed
    FROM jsonb_each(p_new_data)
    WHERE p_old_data->key IS DISTINCT FROM p_new_data->key;
  END IF;

  -- Get previous hash for chaining
  SELECT row_hash INTO v_prev_hash
  FROM public.audit_log
  ORDER BY created_at DESC
  LIMIT 1;

  -- Calculate row hash (SHA-256 of content)
  v_hash := encode(
    digest(
      COALESCE(auth_uid()::text, '') || '|' ||
      p_action::text || '|' ||
      p_table_name || '|' ||
      COALESCE(p_record_id::text, '') || '|' ||
      COALESCE(p_old_data::text, '') || '|' ||
      COALESCE(p_new_data::text, '') || '|' ||
      COALESCE(v_prev_hash, '') || '|' ||
      now()::text,
      'sha256'
    ),
    'hex'
  );

  INSERT INTO public.audit_log (
    actor_id, actor_email, actor_ip, actor_role,
    action, table_name, record_id,
    old_data, new_data, changed_fields,
    request_id, correlation_id,
    row_hash, prev_hash
  ) VALUES (
    auth_uid(),
    current_setting('request.jwt.claim.email', true),
    inet_client_addr(),
    auth_role(),
    p_action, p_table_name, p_record_id,
    p_old_data, p_new_data, v_changed,
    current_setting('request.headers', true)::jsonb->>'x-request-id',
    current_setting('request.headers', true)::jsonb->>'x-correlation-id',
    v_hash, v_prev_hash
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.write_audit_log IS
  'Writes to immutable audit log with hash chaining. SECURITY DEFINER bypasses RLS.';

-- Security event writer
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type public.security_event_type,
  p_severity TEXT,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}',
  p_action_taken TEXT DEFAULT 'logged'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.security_events (
    event_type, severity, actor_id, actor_ip, actor_email,
    description, metadata, action_taken
  ) VALUES (
    p_event_type, p_severity,
    auth_uid(), inet_client_addr(),
    current_setting('request.jwt.claim.email', true),
    p_description, p_metadata, p_action_taken
  )
  RETURNING id INTO v_id;

  -- Critical events trigger immediate notification
  IF p_severity = 'critical' THEN
    PERFORM pg_notify('security_alert', jsonb_build_object(
      'event_id', v_id,
      'type', p_event_type,
      'severity', p_severity,
      'description', p_description,
      'actor', auth_uid(),
      'timestamp', now()
    )::text);
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_security_event IS
  'Logs security events. Critical events send pg_notify for real-time alerting.';
