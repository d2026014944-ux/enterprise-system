-- Migration 00006-00009: RLS Policies, Functions, Grants, Intrusion Detection

-- Secure views
CREATE OR REPLACE VIEW public.ledger_view WITH (security_barrier = true) AS
SELECT le.id, le.transaction_id, le.account_id, le.entry_type, le.amount, le.currency,
       le.balance_after, le.description, le.created_at
FROM public.ledger_entries le
WHERE le.org_id = public.auth_org_id() AND NOT public.is_service_role();

GRANT SELECT ON public.ledger_view TO authenticated;

CREATE OR REPLACE VIEW public.account_balances WITH (security_barrier = true) AS
SELECT a.id, a.org_id, a.name, a.type, a.status, a.currency, a.balance, a.created_at, a.updated_at
FROM public.accounts a
WHERE a.org_id = public.auth_org_id() AND a.status = 'active';

GRANT SELECT ON public.account_balances TO authenticated;

CREATE OR REPLACE VIEW public.transaction_summary WITH (security_barrier = true) AS
SELECT t.id, t.org_id, t.type, t.status, t.amount, t.currency,
       sa.name AS source_account_name, da.name AS dest_account_name,
       t.description, t.created_at, t.processed_at, t.created_by
FROM public.transactions t
LEFT JOIN public.accounts sa ON sa.id = t.source_account_id
LEFT JOIN public.accounts da ON da.id = t.dest_account_id
WHERE t.org_id = public.auth_org_id();

GRANT SELECT ON public.transaction_summary TO authenticated;

-- Secure RPC Functions
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_profile JSONB;
BEGIN
  SELECT jsonb_build_object('id', au.id, 'email', au.email, 'full_name', au.raw_user_meta_data->>'full_name', 'org_role', om.role, 'org_joined_at', om.joined_at, 'last_sign_in', au.last_sign_in_at, 'created_at', au.created_at)
  INTO v_profile FROM auth.users au
  JOIN public.organization_members om ON om.user_id = au.id
  WHERE au.id = public.auth_uid() AND om.org_id = public.auth_org_id() AND om.is_active = true;

  IF v_profile IS NULL THEN
    PERFORM pg_sleep(0.1);
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;
  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_profile FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile TO authenticated;

CREATE OR REPLACE FUNCTION public.list_accounts(p_type public.account_type DEFAULT NULL, p_status public.account_status DEFAULT 'active')
RETURNS SETOF public.accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN
  RETURN QUERY SELECT a.* FROM public.accounts a
  WHERE a.org_id = public.auth_org_id() AND (p_type IS NULL OR a.type = p_type) AND (p_status IS NULL OR a.status = p_status)
  ORDER BY a.created_at DESC;
END; $$;

REVOKE ALL ON FUNCTION public.list_accounts FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_accounts TO authenticated;

CREATE OR REPLACE FUNCTION public.create_account(p_name TEXT, p_type public.account_type, p_currency TEXT DEFAULT 'USD', p_metadata JSONB DEFAULT '{}')
RETURNS public.accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_account public.accounts; v_org_plan public.org_plan; v_count INTEGER;
BEGIN
  IF NOT public.check_rate_limit(format('create_account:%s', public.auth_org_id()), 5, 1) THEN
    RAISE EXCEPTION 'Rate limit exceeded.' USING ERRCODE = '57014';
  END IF;
  SELECT plan INTO v_org_plan FROM public.organizations WHERE id = public.auth_org_id();
  SELECT count(*) INTO v_count FROM public.accounts WHERE org_id = public.auth_org_id();
  IF v_org_plan = 'free' AND v_count >= 3 THEN
    RAISE EXCEPTION 'Free plan limited to 3 accounts.';
  END IF;
  INSERT INTO public.accounts (org_id, name, type, currency, metadata, created_by)
  VALUES (public.auth_org_id(), p_name, p_type, p_currency, p_metadata, public.auth_uid())
  RETURNING * INTO v_account;
  RETURN v_account;
END; $$;

REVOKE ALL ON FUNCTION public.create_account FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_account TO authenticated;

CREATE OR REPLACE FUNCTION public.list_transactions(p_status public.transaction_status DEFAULT NULL, p_type public.transaction_type DEFAULT NULL, p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (id UUID, type public.transaction_type, status public.transaction_status, amount NUMERIC, currency TEXT, source_account_name TEXT, dest_account_name TEXT, description TEXT, created_at TIMESTAMPTZ, processed_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN
  p_limit := LEAST(p_limit, 100);
  RETURN QUERY SELECT t.id, t.type, t.status, t.amount, t.currency, sa.name, da.name, t.description, t.created_at, t.processed_at
  FROM public.transactions t LEFT JOIN public.accounts sa ON sa.id = t.source_account_id LEFT JOIN public.accounts da ON da.id = t.dest_account_id
  WHERE t.org_id = public.auth_org_id() AND (p_status IS NULL OR t.status = p_status) AND (p_type IS NULL OR t.type = p_type)
  ORDER BY t.created_at DESC LIMIT p_limit OFFSET p_offset;
END; $$;

REVOKE ALL ON FUNCTION public.list_transactions FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_transactions TO authenticated;

CREATE OR REPLACE FUNCTION public.get_transaction(p_transaction_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ DECLARE v_txn JSONB;
BEGIN
  SELECT jsonb_build_object('id', t.id, 'type', t.type, 'status', t.status, 'amount', t.amount, 'currency', t.currency,
    'source_account', jsonb_build_object('id', sa.id, 'name', sa.name, 'type', sa.type),
    'dest_account', CASE WHEN da.id IS NOT NULL THEN jsonb_build_object('id', da.id, 'name', da.name, 'type', da.type) END,
    'description', t.description, 'created_at', t.created_at, 'processed_at', t.processed_at)
  INTO v_txn FROM public.transactions t
  LEFT JOIN public.accounts sa ON sa.id = t.source_account_id LEFT JOIN public.accounts da ON da.id = t.dest_account_id
  WHERE t.id = p_transaction_id AND t.org_id = public.auth_org_id();

  IF v_txn IS NULL THEN PERFORM pg_sleep(0.05); RETURN jsonb_build_object('error', 'Transaction not found'); END IF;
  RETURN v_txn;
END; $$;

REVOKE ALL ON FUNCTION public.get_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_transaction TO authenticated;

CREATE OR REPLACE FUNCTION public.list_audit_logs(p_table_name TEXT DEFAULT NULL, p_action public.audit_action DEFAULT NULL, p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (id UUID, actor_email TEXT, action public.audit_action, table_name TEXT, record_id UUID, changed_fields TEXT[], created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ DECLARE v_org_id UUID;
BEGIN
  SELECT om.org_id INTO v_org_id FROM public.organization_members om
  WHERE om.user_id = public.auth_uid() AND om.org_id = public.auth_org_id() AND om.role IN ('owner', 'admin') AND om.is_active = true;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Insufficient permissions.' USING ERRCODE = '42501'; END IF;
  p_limit := LEAST(p_limit, 200);
  RETURN QUERY SELECT al.id, al.actor_email, al.action, al.table_name, al.record_id, al.changed_fields, al.created_at
  FROM public.audit_log al WHERE (p_table_name IS NULL OR al.table_name = p_table_name) AND (p_action IS NULL OR al.action = p_action)
  AND al.actor_id IN (SELECT om2.user_id FROM public.organization_members om2 WHERE om2.org_id = v_org_id)
  ORDER BY al.created_at DESC LIMIT p_limit OFFSET p_offset;
END; $$;

REVOKE ALL ON FUNCTION public.list_audit_logs FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_audit_logs TO authenticated;

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

-- Anon lockdown on all tables
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('schema_migrations', '_prisma_migrations')
  LOOP
    BEGIN
      EXECUTE format('CREATE POLICY "anon_no_access_%I" ON public.%I FOR ALL TO anon USING (false) WITH CHECK (false)', r.tablename, r.tablename);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
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
  SELECT count(DISTINCT ip_address) INTO v_different_ips FROM public.user_sessions
  WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour';
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

-- Schema change monitoring
CREATE OR REPLACE FUNCTION public.monitor_schema_changes()
RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ DECLARE v_obj record;
BEGIN
  FOR v_obj IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    PERFORM public.log_security_event('schema_change', 'high',
      format('Schema change: %s %s %s', v_obj.command_tag, v_obj.object_type, v_obj.object_identity),
      jsonb_build_object('command', v_obj.command_tag, 'object_type', v_obj.object_type, 'object', v_obj.object_identity), 'logged');
  END LOOP;
END; $$;

DROP EVENT TRIGGER IF EXISTS trg_monitor_schema_changes;
CREATE EVENT TRIGGER trg_monitor_schema_changes ON ddl_command_end EXECUTE FUNCTION public.monitor_schema_changes();

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
