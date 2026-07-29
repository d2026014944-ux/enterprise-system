-- Migration 00005: Financial Schema
-- Accounts, Transactions, Double-Entry Ledger

-- Accounts table
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  type public.account_type NOT NULL,
  status public.account_status NOT NULL DEFAULT 'active',
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  balance NUMERIC(19,4) NOT NULL DEFAULT 0.0000
    CHECK (balance >= -999999999999999.9999 AND balance <= 999999999999999.9999),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  CONSTRAINT account_metadata_safe CHECK (
    metadata::text !~* '(script|eval|function|exec|execute)'
  )
);

CREATE INDEX IF NOT EXISTS idx_account_org ON public.accounts (org_id, type);
CREATE INDEX IF NOT EXISTS idx_account_status ON public.accounts (org_id) WHERE status = 'active';

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- Ledger entries
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  transaction_id UUID NOT NULL,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  balance_after NUMERIC(19,4) NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  CONSTRAINT ledger_metadata_safe CHECK (
    metadata::text !~* '(script|eval|function|exec|execute)'
  )
);

CREATE INDEX IF NOT EXISTS idx_ledger_org ON public.ledger_entries (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON public.ledger_entries (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_transaction ON public.ledger_entries (transaction_id);

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- Transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  type public.transaction_type NOT NULL,
  status public.transaction_status NOT NULL DEFAULT 'pending',
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  source_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  dest_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  idempotency_key TEXT UNIQUE,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  processed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  reversed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  CONSTRAINT txn_metadata_safe CHECK (
    metadata::text !~* '(script|eval|function|exec|execute)'
  ),
  CONSTRAINT txn_different_accounts CHECK (
    source_account_id IS NULL OR dest_account_id IS NULL
    OR source_account_id != dest_account_id
  )
);

CREATE INDEX IF NOT EXISTS idx_txn_org ON public.transactions (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_txn_status ON public.transactions (org_id, status);
CREATE INDEX IF NOT EXISTS idx_txn_source ON public.transactions (source_account_id);
CREATE INDEX IF NOT EXISTS idx_txn_dest ON public.transactions (dest_account_id);
CREATE INDEX IF NOT EXISTS idx_txn_idempotency ON public.transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for accounts
CREATE POLICY "accounts_select_org" ON public.accounts FOR SELECT TO authenticated
  USING (org_id = public.auth_org_id() OR public.is_service_role());

CREATE POLICY "accounts_insert_admin" ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (org_id = public.auth_org_id() AND EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = public.auth_org_id() AND user_id = public.auth_uid()
    AND role IN ('owner', 'admin', 'billing') AND is_active = true
  ));

CREATE POLICY "accounts_update_no_direct" ON public.accounts FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "accounts_no_delete" ON public.accounts FOR DELETE TO authenticated
  USING (false);

-- RLS Policies for ledger
CREATE POLICY "ledger_service_only" ON public.ledger_entries FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "ledger_no_direct_authenticated" ON public.ledger_entries FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- RLS Policies for transactions
CREATE POLICY "transactions_select_org" ON public.transactions FOR SELECT TO authenticated
  USING (org_id = public.auth_org_id() OR public.is_service_role());

CREATE POLICY "transactions_insert_billing" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (org_id = public.auth_org_id() AND EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = public.auth_org_id() AND user_id = public.auth_uid()
    AND role IN ('owner', 'admin', 'billing') AND is_active = true
  ));

CREATE POLICY "transactions_no_update" ON public.transactions FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "transactions_no_delete" ON public.transactions FOR DELETE TO authenticated
  USING (false);

-- Balance validation trigger
CREATE OR REPLACE FUNCTION public.validate_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.type != 'credit' AND NEW.balance < 0 THEN
    RAISE EXCEPTION 'Insufficient funds. Account % balance would be %', NEW.id, NEW.balance
      USING ERRCODE = '23514';
  END IF;
  IF OLD.balance IS DISTINCT FROM NEW.balance THEN
    PERFORM public.write_audit_log(
      'update'::public.audit_action, 'accounts', NEW.id,
      jsonb_build_object('balance', OLD.balance), jsonb_build_object('balance', NEW.balance)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_balance ON public.accounts;
CREATE TRIGGER trg_validate_balance BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.validate_balance();

-- Secure transaction processing function
CREATE OR REPLACE FUNCTION public.process_transaction(
  p_org_id UUID, p_type public.transaction_type, p_amount NUMERIC,
  p_source_account UUID, p_dest_account UUID,
  p_description TEXT DEFAULT NULL, p_idempotency_key TEXT DEFAULT NULL, p_metadata JSONB DEFAULT '{}'
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_txn public.transactions;
  v_source_balance NUMERIC;
  v_dest_balance NUMERIC;
  v_source_type public.account_type;
BEGIN
  IF NOT public.check_rate_limit(format('txn:%s', public.auth_org_id()), 50, 10) THEN
    RAISE EXCEPTION 'Transaction rate limit exceeded.' USING ERRCODE = '57014';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_txn FROM public.transactions WHERE idempotency_key = p_idempotency_key AND org_id = p_org_id;
    IF v_txn IS NOT NULL THEN RETURN v_txn; END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_source_account AND org_id = p_org_id AND status = 'active') THEN
    RAISE EXCEPTION 'Source account not found or inactive.' USING ERRCODE = 'P0002';
  END IF;

  IF p_dest_account IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_dest_account AND org_id = p_org_id AND status = 'active') THEN
    RAISE EXCEPTION 'Destination account not found or inactive.' USING ERRCODE = 'P0002';
  END IF;

  SELECT balance, type INTO v_source_balance, v_source_type FROM public.accounts WHERE id = p_source_account FOR UPDATE;

  IF v_source_type != 'credit' AND v_source_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient funds. Available: %, Requested: %', v_source_balance, p_amount USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.transactions (org_id, type, status, amount, currency, source_account_id, dest_account_id, idempotency_key, description, metadata, processed_at, created_by)
  VALUES (p_org_id, p_type, 'completed', p_amount, 'USD', p_source_account, p_dest_account, p_idempotency_key, p_description, p_metadata, now(), public.auth_uid())
  RETURNING * INTO v_txn;

  UPDATE public.accounts SET balance = balance - p_amount, updated_at = now() WHERE id = p_source_account RETURNING balance INTO v_source_balance;
  INSERT INTO public.ledger_entries (org_id, transaction_id, account_id, entry_type, amount, currency, balance_after, description, created_by)
  VALUES (p_org_id, v_txn.id, p_source_account, 'debit', p_amount, 'USD', v_source_balance, p_description, public.auth_uid());

  IF p_dest_account IS NOT NULL THEN
    UPDATE public.accounts SET balance = balance + p_amount, updated_at = now() WHERE id = p_dest_account RETURNING balance INTO v_dest_balance;
    INSERT INTO public.ledger_entries (org_id, transaction_id, account_id, entry_type, amount, currency, balance_after, description, created_by)
    VALUES (p_org_id, v_txn.id, p_dest_account, 'credit', p_amount, 'USD', v_dest_balance, p_description, public.auth_uid());
  END IF;

  PERFORM public.write_audit_log('create'::public.audit_action, 'transactions', v_txn.id, NULL,
    jsonb_build_object('type', p_type, 'amount', p_amount, 'source', p_source_account, 'dest', p_dest_account));

  RETURN v_txn;
END;
$$;

REVOKE ALL ON FUNCTION public.process_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_transaction TO authenticated;
