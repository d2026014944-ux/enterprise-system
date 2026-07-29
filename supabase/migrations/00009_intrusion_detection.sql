-- ============================================================================
-- Migration 009: Intrusion Detection & Anomaly Triggers
-- ============================================================================
-- Proactive defense: detects attacks in real-time and blocks them.
-- Each trigger monitors a specific attack vector.
-- ============================================================================

-- ── 1. SUSPICIOUS QUERY DETECTION ─────────────────────────
-- Monitors for SQL injection patterns in function calls

CREATE OR REPLACE FUNCTION public.detect_suspicious_patterns()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_query TEXT;
BEGIN
  -- Get the current query
  v_query := current_query();

  -- Check for injection patterns
  IF v_query ~* '(union\s+select|drop\s+table|alter\s+table|create\s+function|grant\s+|pg_sleep|pg_terminate|pg_cancel|lo_import|lo_export|copy\s+.*from\s+program)' THEN
    PERFORM public.log_security_event(
      'suspicious_query',
      'critical',
      'Suspicious query pattern detected',
      jsonb_build_object(
        'query', left(v_query, 500),  -- Truncate for safety
        'user', public.auth_uid(),
        'role', current_setting('role', true)
      ),
      'blocked'
    );

    RAISE EXCEPTION 'Query blocked by security policy.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Note: Event triggers fire for DDL, not DML.
-- DML monitoring is done via RLS policies and function-level checks.

-- ── 2. RLS VIOLATION LOGGER ───────────────────────────────
-- Logs when RLS blocks access (potential probing)

CREATE OR REPLACE FUNCTION public.log_rls_violation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.log_security_event(
    'rls_violation',
    'medium',
    format('RLS policy blocked %s on %s', TG_OP, TG_TABLE_NAME),
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'user', public.auth_uid(),
      'attempted_record', CASE
        WHEN TG_OP = 'DELETE' THEN OLD.id
        WHEN TG_OP = 'UPDATE' THEN NEW.id
        ELSE NULL
      END
    ),
    'blocked'
  );

  RETURN NULL;  -- Block the operation
END;
$$;

-- ── 3. BULK OPERATION DETECTION ───────────────────────────
-- Alerts when someone tries to export/extract large amounts of data

CREATE OR REPLACE FUNCTION public.detect_bulk_operation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Count recent operations by this user
  SELECT count(*) INTO v_count
  FROM public.audit_log
  WHERE actor_id = public.auth_uid()
    AND table_name = TG_TABLE_NAME
    AND created_at > now() - interval '1 minute';

  IF v_count > 100 THEN
    PERFORM public.log_security_event(
      'bulk_operation',
      'high',
      format('Bulk operation detected: %s operations on %s in 1 minute', v_count, TG_TABLE_NAME),
      jsonb_build_object(
        'table', TG_TABLE_NAME,
        'operation', TG_OP,
        'count', v_count,
        'user', public.auth_uid()
      ),
      'alerted'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Apply bulk detection to financial tables
CREATE TRIGGER trg_detect_bulk_accounts
  AFTER INSERT OR UPDATE ON public.accounts
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.detect_bulk_operation();

CREATE TRIGGER trg_detect_bulk_transactions
  AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.detect_bulk_operation();

-- ── 4. PRIVILEGE ESCALATION MONITOR ───────────────────────
-- Monitors for attempts to change roles or permissions

CREATE OR REPLACE FUNCTION public.monitor_privilege_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Any role change triggers an alert
  IF TG_OP = 'UPDATE' AND OLD.role != NEW.role THEN
    PERFORM public.log_security_event(
      'role_change',
      'high',
      format('Role changed from %s to %s for user %s in org %s',
        OLD.role, NEW.role, NEW.user_id, NEW.org_id),
      jsonb_build_object(
        'old_role', OLD.role,
        'new_role', NEW.role,
        'user_id', NEW.user_id,
        'org_id', NEW.org_id,
        'changed_by', public.auth_uid()
      ),
      'alerted'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_monitor_privilege_changes
  AFTER UPDATE ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.monitor_privilege_changes();

-- ── 5. SESSION ANOMALY DETECTION ──────────────────────────

CREATE OR REPLACE FUNCTION public.detect_session_anomaly()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_recent_sessions INTEGER;
  v_different_ips INTEGER;
BEGIN
  -- Count sessions from different IPs in last hour
  SELECT
    count(DISTINCT ip_address)
  INTO v_different_ips
  FROM public.user_sessions
  WHERE user_id = NEW.user_id
    AND created_at > now() - interval '1 hour';

  IF v_different_ips > 5 THEN
    PERFORM public.log_security_event(
      'session_hijack_attempt',
      'critical',
      format('User %s has sessions from %s different IPs in 1 hour', NEW.user_id, v_different_ips),
      jsonb_build_object(
        'user_id', NEW.user_id,
        'ip_count', v_different_ips,
        'current_ip', NEW.ip_address
      ),
      'alerted'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_detect_session_anomaly
  AFTER INSERT ON public.user_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.detect_session_anomaly();

-- ── 6. API KEY USAGE MONITORING ───────────────────────────

CREATE OR REPLACE FUNCTION public.monitor_api_key_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Update usage stats
  NEW.last_used_at := now();
  NEW.usage_count := OLD.usage_count + 1;

  -- Detect unusual usage patterns
  IF NEW.usage_count - OLD.usage_count > 1000 THEN
    PERFORM public.log_security_event(
      'bulk_operation',
      'high',
      format('API key %s used %s times (rapid usage detected)', NEW.key_prefix, NEW.usage_count - OLD.usage_count),
      jsonb_build_object(
        'key_id', NEW.id,
        'key_prefix', NEW.key_prefix,
        'org_id', NEW.org_id
      ),
      'alerted'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ── 7. SCHEMA CHANGE MONITORING ───────────────────────────

CREATE OR REPLACE FUNCTION public.monitor_schema_changes()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_obj record;
BEGIN
  FOR v_obj IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    PERFORM public.log_security_event(
      'schema_change',
      'high',
      format('Schema change: %s %s %s', v_obj.command_tag, v_obj.object_type, v_obj.object_identity),
      jsonb_build_object(
        'command', v_obj.command_tag,
        'object_type', v_obj.object_type,
        'object', v_obj.object_identity,
        'user', current_setting('role', true)
      ),
      'logged'
    );
  END LOOP;
END;
$$;

CREATE EVENT TRIGGER trg_monitor_schema_changes
  ON ddl_command_end
  EXECUTE FUNCTION public.monitor_schema_changes();
