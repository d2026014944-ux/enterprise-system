-- Migration 00006-00009: Part 2 - Grants and Intrusion Detection

-- Grants (minimal privilege)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.organization_members TO authenticated;
GRANT SELECT ON public.accounts TO authenticated;
GRANT SELECT ON public.transactions TO authenticated;
GRANT SELECT ON public.user_sessions TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Force RLS on all tables
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END; $$;

-- Bulk operation detection
CREATE OR REPLACE FUNCTION public.detect_bulk_operation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ DECLARE v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM public.audit_log WHERE actor_id = public.auth_uid() AND table_name = TG_TABLE_NAME AND created_at > now() - interval '1 minute';
  IF v_count > 100 THEN
    PERFORM public.log_security_event('bulk_operation', 'high',
      format('Bulk operation detected: %s on %s in 1 minute', v_count, TG_TABLE_NAME),
      jsonb_build_object('table', TG_TABLE_NAME, 'operation', TG_OP, 'count', v_count), 'alerted');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_detect_bulk_accounts ON public.accounts;
CREATE TRIGGER trg_detect_bulk_accounts AFTER INSERT OR UPDATE ON public.accounts
  FOR EACH STATEMENT EXECUTE FUNCTION public.detect_bulk_operation();

DROP TRIGGER IF EXISTS trg_detect_bulk_transactions ON public.transactions;
CREATE TRIGGER trg_detect_bulk_transactions AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH STATEMENT EXECUTE FUNCTION public.detect_bulk_operation();

-- Privilege escalation monitor
CREATE OR REPLACE FUNCTION public.monitor_privilege_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN
  IF TG_OP = 'UPDATE' AND OLD.role != NEW.role THEN
    PERFORM public.log_security_event('role_change', 'high',
      format('Role changed from %s to %s for user %s in org %s', OLD.role, NEW.role, NEW.user_id, NEW.org_id),
      jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role, 'user_id', NEW.user_id, 'org_id', NEW.org_id, 'changed_by', public.auth_uid()), 'alerted');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_monitor_privilege_changes ON public.organization_members;
CREATE TRIGGER trg_monitor_privilege_changes AFTER UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.monitor_privilege_changes();

-- Session anomaly detection
CREATE OR REPLACE FUNCTION public.detect_session_anomaly()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ DECLARE v_different_ips INTEGER;
BEGIN
  SELECT count(DISTINCT ip_address) INTO v_different_ips FROM public.user_sessions WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour';
  IF v_different_ips > 5 THEN
    PERFORM public.log_security_event('session_hijack_attempt', 'critical',
      format('User %s has sessions from %s different IPs in 1 hour', NEW.user_id, v_different_ips),
      jsonb_build_object('user_id', NEW.user_id, 'ip_count', v_different_ips, 'current_ip', NEW.ip_address), 'alerted');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_detect_session_anomaly ON public.user_sessions;
CREATE TRIGGER trg_detect_session_anomaly AFTER INSERT ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.detect_session_anomaly();

-- Audit grants function
CREATE OR REPLACE FUNCTION public.audit_grants()
RETURNS TABLE (grantee TEXT, table_name TEXT, privilege_type TEXT, is_grantable BOOLEAN)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ SELECT grantee::text, table_name::text, privilege_type::text, is_grantable::boolean
  FROM information_schema.table_privileges WHERE table_schema = 'public' ORDER BY grantee, table_name, privilege_type; $$;

REVOKE ALL ON FUNCTION public.audit_grants FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_grants TO service_role;

-- RLS coverage audit function
CREATE OR REPLACE FUNCTION public.audit_rls_coverage()
RETURNS TABLE (table_name TEXT, rls_enabled BOOLEAN, policy_count BIGINT, has_select_policy BOOLEAN, has_insert_policy BOOLEAN, has_update_policy BOOLEAN, has_delete_policy BOOLEAN)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ SELECT c.relname::text, c.relrowsecurity, COUNT(p.polname), BOOL_OR(p.polcmd = 'r' OR p.polcmd = '*'), BOOL_OR(p.polcmd = 'a' OR p.polcmd = '*'), BOOL_OR(p.polcmd = 'w' OR p.polcmd = '*'), BOOL_OR(p.polcmd = 'd' OR p.polcmd = '*')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_policy p ON p.polrelid = c.oid
  WHERE n.nspname = 'public' AND c.relkind = 'r' GROUP BY c.relname, c.relrowsecurity ORDER BY c.relrowsecurity, c.relname; $$;

REVOKE ALL ON FUNCTION public.audit_rls_coverage FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_rls_coverage TO service_role;
