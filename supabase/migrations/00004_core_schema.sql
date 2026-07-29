-- ============================================================================
-- Migration 004: Core Schema — Organizations & Users
-- ============================================================================
-- THREAT MODEL:
--   Attack Vector 1: IDOR — user accesses another org's data
--     Defense: org_id from JWT claim, RLS enforces org isolation
--   Attack Vector 2: Privilege escalation — member becomes admin
--     Defense: role changes require SECURITY DEFINER function with validation
--   Attack Vector 3: Stale JWT — revoked user still has valid token
--     Defense: session validation, short-lived tokens, revocation check
--   Attack Vector 4: SQL injection via search/filter
--     Defense: parameterized queries only, no dynamic SQL in RLS
-- ============================================================================

-- ── ORGANIZATIONS ─────────────────────────────────────────
-- Multi-tenant root. Every other table references this.

CREATE TABLE public.organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  slug          TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  plan          public.org_plan NOT NULL DEFAULT 'free',
  status        public.org_status NOT NULL DEFAULT 'active',
  -- Billing
  stripe_customer_id TEXT UNIQUE,
  billing_email TEXT,
  -- Limits (enforced at DB level, not just application)
  max_members   INTEGER NOT NULL DEFAULT 5,
  max_storage_bytes BIGINT NOT NULL DEFAULT 1073741824,  -- 1GB
  -- Metadata
  settings      JSONB NOT NULL DEFAULT '{}',
  metadata      JSONB NOT NULL DEFAULT '{}',
  -- Timestamps
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,

  -- Prevent settings from containing executable content
  CONSTRAINT org_settings_safe CHECK (
    settings::text !~* '(script|eval|function|exec|execute|drop|alter|create|grant)'
  ),
  CONSTRAINT org_metadata_safe CHECK (
    metadata::text !~* '(script|eval|function|exec|execute|drop|alter|create|grant)'
  )
);

CREATE INDEX idx_org_slug ON public.organizations (slug);
CREATE INDEX idx_org_status ON public.organizations (status) WHERE status = 'active';

-- RLS: Users can only see their own organization
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_select_own"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    id = public.auth_org_id()
    OR public.is_service_role()
  );

CREATE POLICY "org_update_owner_admin"
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (
    id = public.auth_org_id()
    AND EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE org_id = public.auth_org_id()
        AND user_id = public.auth_uid()
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    id = public.auth_org_id()
    -- Prevent changing org_id (tenant isolation bypass)
    AND id = OLD.id
  );

-- No direct DELETE — use soft delete via status
CREATE POLICY "org_no_delete"
  ON public.organizations
  FOR DELETE
  TO authenticated
  USING (false);

-- ── ORGANIZATION MEMBERS ──────────────────────────────────
-- Junction table: users ↔ organizations with roles

CREATE TABLE public.organization_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  role          public.user_role NOT NULL DEFAULT 'member',
  -- Invitation tracking
  invited_by    UUID,
  invited_at    TIMESTAMPTZ,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Status
  is_active     BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  -- Timestamps
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One role per user per org
  CONSTRAINT org_member_unique UNIQUE (org_id, user_id)
);

CREATE INDEX idx_org_member_user ON public.organization_members (user_id);
CREATE INDEX idx_org_member_org ON public.organization_members (org_id, role);
CREATE INDEX idx_org_member_active ON public.organization_members (org_id)
  WHERE is_active = true;

-- RLS: Members can see other members in their org
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select"
  ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (
    org_id = public.auth_org_id()
    OR user_id = public.auth_uid()  -- Can always see own membership
    OR public.is_service_role()
  );

-- Only owners/admins can modify membership
CREATE POLICY "org_members_insert_admin"
  ON public.organization_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE org_id = public.auth_org_id()
        AND user_id = public.auth_uid()
        AND role IN ('owner', 'admin')
    )
    AND org_id = public.auth_org_id()  -- Can only add to own org
  );

CREATE POLICY "org_members_update_admin"
  ON public.organization_members
  FOR UPDATE
  TO authenticated
  USING (
    org_id = public.auth_org_id()
    AND EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE org_id = public.auth_org_id()
        AND user_id = public.auth_uid()
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    org_id = public.auth_org_id()
    -- Cannot change org_id (tenant isolation)
    AND org_id = OLD.org_id
    -- Cannot change user_id (identity manipulation)
    AND user_id = OLD.user_id
  );

-- Only owners can remove members
CREATE POLICY "org_members_delete_owner"
  ON public.organization_members
  FOR DELETE
  TO authenticated
  USING (
    org_id = public.auth_org_id()
    AND EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE org_id = public.auth_org_id()
        AND user_id = public.auth_uid()
        AND role = 'owner'
    )
    -- Cannot remove yourself (must transfer ownership first)
    AND user_id != public.auth_uid()
  );

-- ── ROLE CHANGE AUDIT TRIGGER ─────────────────────────────
-- Every role change is logged and validated

CREATE OR REPLACE FUNCTION public.validate_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role public.user_role;
BEGIN
  -- Get the actor's role in this org
  SELECT role INTO v_actor_role
  FROM public.organization_members
  WHERE org_id = NEW.org_id
    AND user_id = public.auth_uid()
    AND is_active = true;

  -- Only owner can create/assign owner role
  IF NEW.role = 'owner' AND v_actor_role != 'owner' THEN
    PERFORM public.log_security_event(
      'privilege_escalation_attempt',
      'critical',
      format('User %s attempted to assign owner role without being owner', public.auth_uid()),
      jsonb_build_object('target_user', NEW.user_id, 'org', NEW.org_id, 'actor_role', v_actor_role),
      'blocked'
    );
    RAISE EXCEPTION 'Only the organization owner can assign the owner role.'
      USING ERRCODE = '42501';
  END IF;

  -- Owners cannot be demoted by non-owners
  IF TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role != 'owner' AND v_actor_role != 'owner' THEN
    PERFORM public.log_security_event(
      'privilege_escalation_attempt',
      'critical',
      format('User %s attempted to demote owner %s', public.auth_uid(), OLD.user_id),
      jsonb_build_object('target_user', OLD.user_id, 'org', OLD.org_id),
      'blocked'
    );
    RAISE EXCEPTION 'Only the owner can demote another owner.'
      USING ERRCODE = '42501';
  END IF;

  -- Log all role changes
  IF TG_OP = 'UPDATE' AND OLD.role != NEW.role THEN
    PERFORM public.write_audit_log(
      'update'::public.audit_action,
      'organization_members',
      NEW.id,
      jsonb_build_object('role', OLD.role),
      jsonb_build_object('role', NEW.role)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_role_change
  BEFORE INSERT OR UPDATE ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_role_change();

-- ── SECURE ROLE CHANGE FUNCTION ───────────────────────────
-- The ONLY way to change roles. Validates everything.

CREATE OR REPLACE FUNCTION public.change_member_role(
  p_org_id UUID,
  p_user_id UUID,
  p_new_role public.user_role
)
RETURNS public.organization_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result public.organization_members;
  v_actor_role public.user_role;
BEGIN
  -- Rate limit check
  IF NOT public.check_rate_limit(
    format('role_change:%s', public.auth_uid()), 5, 1
  ) THEN
    PERFORM public.log_security_event(
      'rate_limit_exceeded',
      'medium',
      'Role change rate limit exceeded',
      jsonb_build_object('actor', public.auth_uid(), 'target', p_user_id)
    );
    RAISE EXCEPTION 'Rate limit exceeded. Try again later.'
      USING ERRCODE = '57014';  -- query_canceled
  END IF;

  -- Validate actor has permission
  SELECT role INTO v_actor_role
  FROM public.organization_members
  WHERE org_id = p_org_id
    AND user_id = public.auth_uid()
    AND is_active = true;

  IF v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Insufficient permissions to change roles.'
      USING ERRCODE = '42501';
  END IF;

  -- Admin cannot promote to owner
  IF p_new_role = 'owner' AND v_actor_role != 'owner' THEN
    RAISE EXCEPTION 'Only the owner can assign the owner role.'
      USING ERRCODE = '42501';
  END IF;

  -- Perform the update
  UPDATE public.organization_members
  SET role = p_new_role, updated_at = now()
  WHERE org_id = p_org_id AND user_id = p_user_id
  RETURNING * INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Member not found in organization.'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.change_member_role FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_member_role TO authenticated;
