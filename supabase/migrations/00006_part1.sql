-- Migration 00006-00009: Part 1 - Views and Functions

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
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ DECLARE v_profile JSONB;
BEGIN
  SELECT jsonb_build_object('id', au.id, 'email', au.email, 'full_name', au.raw_user_meta_data->>'full_name', 'org_role', om.role, 'org_joined_at', om.joined_at, 'last_sign_in', au.last_sign_in_at, 'created_at', au.created_at)
  INTO v_profile FROM auth.users au JOIN public.organization_members om ON om.user_id = au.id
  WHERE au.id = public.auth_uid() AND om.org_id = public.auth_org_id() AND om.is_active = true;
  IF v_profile IS NULL THEN PERFORM pg_sleep(0.1); RETURN jsonb_build_object('error', 'Profile not found'); END IF;
  RETURN v_profile;
END; $$;

REVOKE ALL ON FUNCTION public.get_my_profile FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile TO authenticated;

CREATE OR REPLACE FUNCTION public.list_accounts(p_type public.account_type DEFAULT NULL, p_status public.account_status DEFAULT 'active')
RETURNS SETOF public.accounts LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN
  RETURN QUERY SELECT a.* FROM public.accounts a WHERE a.org_id = public.auth_org_id() AND (p_type IS NULL OR a.type = p_type) AND (p_status IS NULL OR a.status = p_status) ORDER BY a.created_at DESC;
END; $$;

REVOKE ALL ON FUNCTION public.list_accounts FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_accounts TO authenticated;

CREATE OR REPLACE FUNCTION public.create_account(p_name TEXT, p_type public.account_type, p_currency TEXT DEFAULT 'USD', p_metadata JSONB DEFAULT '{}')
RETURNS public.accounts LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ DECLARE v_account public.accounts; v_org_plan public.org_plan; v_count INTEGER;
BEGIN
  IF NOT public.check_rate_limit(format('create_account:%s', public.auth_org_id()), 5, 1) THEN RAISE EXCEPTION 'Rate limit exceeded.' USING ERRCODE = '57014'; END IF;
  SELECT plan INTO v_org_plan FROM public.organizations WHERE id = public.auth_org_id();
  SELECT count(*) INTO v_count FROM public.accounts WHERE org_id = public.auth_org_id();
  IF v_org_plan = 'free' AND v_count >= 3 THEN RAISE EXCEPTION 'Free plan limited to 3 accounts.'; END IF;
  INSERT INTO public.accounts (org_id, name, type, currency, metadata, created_by) VALUES (public.auth_org_id(), p_name, p_type, p_currency, p_metadata, public.auth_uid()) RETURNING * INTO v_account;
  RETURN v_account;
END; $$;

REVOKE ALL ON FUNCTION public.create_account FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_account TO authenticated;

CREATE OR REPLACE FUNCTION public.list_transactions(p_status public.transaction_status DEFAULT NULL, p_type public.transaction_type DEFAULT NULL, p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (id UUID, type public.transaction_type, status public.transaction_status, amount NUMERIC, currency TEXT, source_account_name TEXT, dest_account_name TEXT, description TEXT, created_at TIMESTAMPTZ, processed_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN p_limit := LEAST(p_limit, 100);
  RETURN QUERY SELECT t.id, t.type, t.status, t.amount, t.currency, sa.name, da.name, t.description, t.created_at, t.processed_at
  FROM public.transactions t LEFT JOIN public.accounts sa ON sa.id = t.source_account_id LEFT JOIN public.accounts da ON da.id = t.dest_account_id
  WHERE t.org_id = public.auth_org_id() AND (p_status IS NULL OR t.status = p_status) AND (p_type IS NULL OR t.type = p_type) ORDER BY t.created_at DESC LIMIT p_limit OFFSET p_offset;
END; $$;

REVOKE ALL ON FUNCTION public.list_transactions FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_transactions TO authenticated;

CREATE OR REPLACE FUNCTION public.get_transaction(p_transaction_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ DECLARE v_txn JSONB;
BEGIN
  SELECT jsonb_build_object('id', t.id, 'type', t.type, 'status', t.status, 'amount', t.amount, 'currency', t.currency,
    'source_account', jsonb_build_object('id', sa.id, 'name', sa.name, 'type', sa.type),
    'dest_account', CASE WHEN da.id IS NOT NULL THEN jsonb_build_object('id', da.id, 'name', da.name, 'type', da.type) END,
    'description', t.description, 'created_at', t.created_at, 'processed_at', t.processed_at)
  INTO v_txn FROM public.transactions t LEFT JOIN public.accounts sa ON sa.id = t.source_account_id LEFT JOIN public.accounts da ON da.id = t.dest_account_id
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
  SELECT om.org_id INTO v_org_id FROM public.organization_members om WHERE om.user_id = public.auth_uid() AND om.org_id = public.auth_org_id() AND om.role IN ('owner', 'admin') AND om.is_active = true;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Insufficient permissions.' USING ERRCODE = '42501'; END IF;
  p_limit := LEAST(p_limit, 200);
  RETURN QUERY SELECT al.id, al.actor_email, al.action, al.table_name, al.record_id, al.changed_fields, al.created_at
  FROM public.audit_log al WHERE (p_table_name IS NULL OR al.table_name = p_table_name) AND (p_action IS NULL OR al.action = p_action)
  AND al.actor_id IN (SELECT om2.user_id FROM public.organization_members om2 WHERE om2.org_id = v_org_id) ORDER BY al.created_at DESC LIMIT p_limit OFFSET p_offset;
END; $$;

REVOKE ALL ON FUNCTION public.list_audit_logs FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_audit_logs TO authenticated;
