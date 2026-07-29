-- Migration 00004: Core Schema (Applied manually via API)
-- Organizations, Members, Role Validation

-- Trigger function for role validation
CREATE OR REPLACE FUNCTION public.validate_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role public.user_role;
BEGIN
  -- Prevent changing org_id or user_id
  IF TG_OP = 'UPDATE' THEN
    IF NEW.org_id != OLD.org_id THEN
      RAISE EXCEPTION 'Cannot change organization membership.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.user_id != OLD.user_id THEN
      RAISE EXCEPTION 'Cannot change membership user.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Get actor role
  SELECT role INTO v_actor_role
  FROM public.organization_members
  WHERE org_id = NEW.org_id
    AND user_id = public.auth_uid()
    AND is_active = true;

  -- Only owner can create owner role
  IF NEW.role = 'owner' AND v_actor_role != 'owner' THEN
    PERFORM public.log_security_event(
      'privilege_escalation_attempt', 'critical',
      format('User %s attempted to assign owner role', public.auth_uid()),
      jsonb_build_object('target', NEW.user_id, 'org', NEW.org_id), 'blocked'
    );
    RAISE EXCEPTION 'Only the organization owner can assign the owner role.'
      USING ERRCODE = '42501';
  END IF;

  -- Owners cannot be demoted by non-owners
  IF TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role != 'owner' AND v_actor_role != 'owner' THEN
    PERFORM public.log_security_event(
      'privilege_escalation_attempt', 'critical',
      format('User %s attempted to demote owner %s', public.auth_uid(), OLD.user_id),
      jsonb_build_object('target', OLD.user_id, 'org', OLD.org_id), 'blocked'
    );
    RAISE EXCEPTION 'Only the owner can demote another owner.'
      USING ERRCODE = '42501';
  END IF;

  -- Log role changes
  IF TG_OP = 'UPDATE' AND OLD.role != NEW.role THEN
    PERFORM public.write_audit_log(
      'update'::public.audit_action, 'organization_members', NEW.id,
      jsonb_build_object('role', OLD.role), jsonb_build_object('role', NEW.role)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_validate_role_change ON public.organization_members;
CREATE TRIGGER trg_validate_role_change
  BEFORE INSERT OR UPDATE ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_role_change();

-- Secure role change function
CREATE OR REPLACE FUNCTION public.change_member_role(
  p_org_id UUID, p_user_id UUID, p_new_role public.user_role
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
  -- Rate limit
  IF NOT public.check_rate_limit(format('role_change:%s', public.auth_uid()), 5, 1) THEN
    RAISE EXCEPTION 'Rate limit exceeded.' USING ERRCODE = '57014';
  END IF;

  -- Validate permissions
  SELECT role INTO v_actor_role
  FROM public.organization_members
  WHERE org_id = p_org_id AND user_id = public.auth_uid() AND is_active = true;

  IF v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Insufficient permissions.' USING ERRCODE = '42501';
  END IF;

  IF p_new_role = 'owner' AND v_actor_role != 'owner' THEN
    RAISE EXCEPTION 'Only owner can assign owner role.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.organization_members
  SET role = p_new_role, updated_at = now()
  WHERE org_id = p_org_id AND user_id = p_user_id
  RETURNING * INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Member not found.' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.change_member_role FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_member_role TO authenticated;
