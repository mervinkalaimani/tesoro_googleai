-- ---------------------------------------------------------------------------
-- Asking for Pro, through the asker's own session.
--
-- The first version of this went through a server route that reads with the
-- service role. Without SUPABASE_SERVICE_ROLE_KEY in the environment that
-- client is a stub whose auth object has no getUser at all, so establishing
-- who was asking failed and every request was refused -- which is what a free
-- account saw when it pressed the button.
--
-- The ask is the account's own row, so it does not need an administrator to
-- write it. This is security definer only to keep the rule in one place: an
-- account may set its own pro_requested_at, once, and only while it is not
-- already on Pro. The notification that follows is a courtesy and is allowed
-- to fail.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tesoro_request_pro()
RETURNS TABLE (requested_at timestamptz, was_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _when timestamptz;
  _exists boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING errcode = '28000';
  END IF;

  SELECT true, t.pro_requested_at INTO _exists, _when
    FROM public.tesoro_users t WHERE t.auth_uid = _uid;
  IF NOT coalesce(_exists, false) THEN
    RAISE EXCEPTION 'No account for this sign-in.' USING errcode = 'P0002';
  END IF;

  -- Nothing to ask for, and saying so beats recording a request that will
  -- never be acted on.
  IF public.is_tesoro_pro(_uid) THEN
    RETURN QUERY SELECT NULL::timestamptz, false;
    RETURN;
  END IF;

  IF _when IS NULL THEN
    _when := now();
    UPDATE public.tesoro_users SET pro_requested_at = _when WHERE auth_uid = _uid;
    RETURN QUERY SELECT _when, true;
  ELSE
    -- Asking twice is not an error. The first ask keeps its date.
    RETURN QUERY SELECT _when, false;
  END IF;
END;
$function$;

-- Supabase grants EXECUTE on new public functions to anon and authenticated by
-- default, and anon does not lose that through the PUBLIC revoke below -- it
-- holds the grant in its own right. A signed-out caller writing a request onto
-- somebody is exactly what this must not allow, so it is revoked by name.
REVOKE ALL ON FUNCTION public.tesoro_request_pro() FROM public;
REVOKE ALL ON FUNCTION public.tesoro_request_pro() FROM anon;
GRANT EXECUTE ON FUNCTION public.tesoro_request_pro() TO authenticated;

COMMENT ON FUNCTION public.tesoro_request_pro() IS
  'An account asks for Pro. Writes its own pro_requested_at once; returns the date and whether this call made it.';

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.tesoro_request_pro()', 'execute') THEN
    RAISE EXCEPTION 'CHECK: anon should not be able to ask for Pro';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.tesoro_request_pro()', 'execute') THEN
    RAISE EXCEPTION 'CHECK: a signed-in account should be able to ask for Pro';
  END IF;
  RAISE NOTICE 'All checks passed.';
END $$;
