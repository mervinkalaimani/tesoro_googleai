-- ---------------------------------------------------------------------------
-- Which plan was asked for.
--
-- There are three now: Free, Plus (another hundred cars) and Pro. A request
-- that does not say which one is a request somebody has to answer with a
-- question, so the asker names it and the admin screen shows it.
-- ---------------------------------------------------------------------------

ALTER TABLE public.tesoro_users
  ADD COLUMN IF NOT EXISTS pro_requested_plan text;

ALTER TABLE public.tesoro_users
  DROP CONSTRAINT IF EXISTS tesoro_users_pro_requested_plan_check;
ALTER TABLE public.tesoro_users
  ADD CONSTRAINT tesoro_users_pro_requested_plan_check
  CHECK (pro_requested_plan IS NULL OR pro_requested_plan IN ('plus', 'pro'));

COMMENT ON COLUMN public.tesoro_users.pro_requested_plan IS
  'Which plan was asked for: plus (100 more cars) or pro. Cleared when granted.';

CREATE OR REPLACE FUNCTION public.tesoro_request_pro(_plan text DEFAULT 'pro')
RETURNS TABLE (requested_at timestamptz, requested_plan text, was_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _when timestamptz;
  _had text;
  _exists boolean;
  _want text := lower(coalesce(nullif(trim(_plan), ''), 'pro'));
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING errcode = '28000';
  END IF;
  IF _want NOT IN ('plus', 'pro') THEN
    RAISE EXCEPTION 'Unknown plan: %', _plan USING errcode = '22023';
  END IF;

  SELECT true, t.pro_requested_at, t.pro_requested_plan
    INTO _exists, _when, _had
    FROM public.tesoro_users t WHERE t.auth_uid = _uid;
  IF NOT coalesce(_exists, false) THEN
    RAISE EXCEPTION 'No account for this sign-in.' USING errcode = 'P0002';
  END IF;

  IF public.is_tesoro_pro(_uid) THEN
    RETURN QUERY SELECT NULL::timestamptz, NULL::text, false;
    RETURN;
  END IF;

  -- A first ask records the date. Changing your mind about which plan keeps
  -- the original date and updates the plan: it is the same person still
  -- waiting, not a second request.
  IF _when IS NULL THEN
    _when := now();
    UPDATE public.tesoro_users
       SET pro_requested_at = _when, pro_requested_plan = _want
     WHERE auth_uid = _uid;
    RETURN QUERY SELECT _when, _want, true;
  ELSIF _had IS DISTINCT FROM _want THEN
    UPDATE public.tesoro_users SET pro_requested_plan = _want WHERE auth_uid = _uid;
    RETURN QUERY SELECT _when, _want, true;
  ELSE
    RETURN QUERY SELECT _when, _had, false;
  END IF;
END;
$function$;

DROP FUNCTION IF EXISTS public.tesoro_request_pro();

REVOKE ALL ON FUNCTION public.tesoro_request_pro(text) FROM public;
REVOKE ALL ON FUNCTION public.tesoro_request_pro(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.tesoro_request_pro(text) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE FUNCTION public.admin_list_users()
RETURNS TABLE (
  sno bigint, user_id text, auth_uid uuid, first_name text, last_name text,
  email_id text, dob date, is_admin boolean, is_approved boolean, is_owner boolean,
  is_pro boolean, pro_since date, pro_until date, over_limit_since date,
  pro_requested_at timestamptz, pro_requested_plan text,
  created_at timestamptz, car_count bigint, last_sign_in timestamptz, rejected_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    t.sno, t.user_id, t.auth_uid, t.first_name, t.last_name, t.email_id, t.dob,
    t.is_admin, t.is_approved, t.is_owner,
    t.is_pro, t.pro_since, t.pro_until, t.over_limit_since,
    t.pro_requested_at, t.pro_requested_plan,
    t.created_at,
    (SELECT count(*) FROM public.tesoro_raw c
      WHERE c.user_id = t.auth_uid AND c.archived_at IS NULL) AS car_count,
    u.last_sign_in_at,
    t.rejected_at
  FROM public.tesoro_users t
  LEFT JOIN auth.users u ON u.id = t.auth_uid
  WHERE public.is_tesoro_admin(auth.uid())
  ORDER BY t.sno;
$function$;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.tesoro_request_pro(text)', 'execute') THEN
    RAISE EXCEPTION 'CHECK: anon should not be able to ask for a plan';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.tesoro_request_pro(text)', 'execute') THEN
    RAISE EXCEPTION 'CHECK: a signed-in account should be able to ask for a plan';
  END IF;
  RAISE NOTICE 'All checks passed.';
END $$;
