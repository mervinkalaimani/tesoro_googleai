-- ---------------------------------------------------------------------------
-- Admin user management: email changes for admins, deletion for the owner only.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Deleting an account becomes the owner's privilege alone
--
-- Replaces "Admins delete profiles". Approving, suspending and promoting stay
-- with every admin; removing someone does not.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins delete profiles" ON public.tesoro_users;
DROP POLICY IF EXISTS "Owner deletes profiles" ON public.tesoro_users;

CREATE POLICY "Owner deletes profiles" ON public.tesoro_users
  FOR DELETE USING (
    public.is_tesoro_owner(auth.uid())
    -- Not yourself, and never the owner row: the app must keep an owner.
    AND auth_uid IS DISTINCT FROM auth.uid()
    AND NOT is_owner
  );

-- ---------------------------------------------------------------------------
-- 2. Changing another account's email address
--
-- The profile row is only half of it: credentials live in auth.users, and
-- signInWithPassword authenticates against *that* address. Updating email_id
-- alone would leave the admin looking at the new address while the person
-- still had to sign in with the old one, and email_for_login would hand out an
-- address that does not authenticate.
--
-- Writing auth.users directly skips the confirmation email GoTrue would
-- normally send to both addresses. That matches this project, where "Confirm
-- email" is switched off, but it does mean an admin can move an account to an
-- address nobody has proven they control -- deliberately an admin-only power.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_update_user_email(_sno bigint, _email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_uid   uuid;
  target_owner boolean;
  clean        text := lower(TRIM(COALESCE(_email, '')));
BEGIN
  IF NOT public.is_tesoro_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only an admin may change an email address.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF clean !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'That is not a valid email address.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT auth_uid, is_owner INTO target_uid, target_owner
  FROM public.tesoro_users
  WHERE sno = _sno;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No account with that id.' USING ERRCODE = 'no_data_found';
  END IF;

  -- The owner's own address is the owner's business.
  IF target_owner AND NOT public.is_tesoro_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Only the owner can change the owner''s email address.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tesoro_users WHERE lower(email_id) = clean AND sno <> _sno
  ) THEN
    RAISE EXCEPTION 'Another account already uses %.', clean
      USING ERRCODE = 'unique_violation';
  END IF;

  IF target_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = clean AND id <> target_uid
  ) THEN
    RAISE EXCEPTION 'Another sign-in already uses %.', clean
      USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE public.tesoro_users SET email_id = clean WHERE sno = _sno;

  -- Keep the sign-in address in step with the profile.
  IF target_uid IS NOT NULL THEN
    UPDATE auth.users
    SET email = clean,
        email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = target_uid;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user_email(bigint, text) FROM public;
REVOKE ALL ON FUNCTION public.admin_update_user_email(bigint, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_email(bigint, text) TO authenticated;
