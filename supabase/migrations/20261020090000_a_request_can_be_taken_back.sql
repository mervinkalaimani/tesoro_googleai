-- Asking for a plan could be done and nudged but never withdrawn, so somebody
-- who changed their mind left a request sitting on an admin's screen with no
-- way to take it back. The same session that wrote it can clear it.
--
-- Security definer for the same reason tesoro_request_pro is: an account may
-- clear its own request and nobody else's, and that rule lives in one place
-- rather than in whatever the browser was willing to send.

CREATE OR REPLACE FUNCTION public.tesoro_cancel_pro_request()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _had boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING errcode = '28000';
  END IF;

  SELECT t.pro_requested_at IS NOT NULL INTO _had
    FROM public.tesoro_users t WHERE t.auth_uid = _uid;
  IF _had IS NULL THEN
    RAISE EXCEPTION 'No account for this sign-in.' USING errcode = 'P0002';
  END IF;

  -- Clearing all three together: a plan or a term left behind without a date
  -- is a request the admin screen cannot show and nothing can clear.
  UPDATE public.tesoro_users
     SET pro_requested_at = NULL, pro_requested_plan = NULL, pro_requested_term = NULL
   WHERE auth_uid = _uid;

  -- Withdrawing nothing is not an error; it is the state being asked for.
  RETURN _had;
END;
$function$;

REVOKE ALL ON FUNCTION public.tesoro_cancel_pro_request() FROM public;
REVOKE ALL ON FUNCTION public.tesoro_cancel_pro_request() FROM anon;
GRANT EXECUTE ON FUNCTION public.tesoro_cancel_pro_request() TO authenticated;

COMMENT ON FUNCTION public.tesoro_cancel_pro_request() IS
  'An account withdraws its own request for a plan. True when there was one to withdraw.';

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.tesoro_cancel_pro_request()', 'execute') THEN
    RAISE EXCEPTION 'CHECK: anon should not be able to withdraw a request';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.tesoro_cancel_pro_request()', 'execute') THEN
    RAISE EXCEPTION 'CHECK: a signed-in account should be able to withdraw its request';
  END IF;
  RAISE NOTICE 'All checks passed.';
END $$;
