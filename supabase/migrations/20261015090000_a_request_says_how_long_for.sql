-- ---------------------------------------------------------------------------
-- And for how long.
--
-- Each plan is sold by the month, the half year or the year, at a different
-- price. A request that names the plan but not the term is still a request
-- somebody has to answer with a question, which is the thing the plan column
-- was added to stop.
-- ---------------------------------------------------------------------------

ALTER TABLE public.tesoro_users
  ADD COLUMN IF NOT EXISTS pro_requested_term text;

ALTER TABLE public.tesoro_users
  DROP CONSTRAINT IF EXISTS tesoro_users_pro_requested_term_check;
ALTER TABLE public.tesoro_users
  ADD CONSTRAINT tesoro_users_pro_requested_term_check
  CHECK (pro_requested_term IS NULL OR pro_requested_term IN ('month', 'half', 'year'));

COMMENT ON COLUMN public.tesoro_users.pro_requested_term IS
  'How long the requested plan was asked for: month, half (6) or year. Cleared when granted.';

CREATE OR REPLACE FUNCTION public.tesoro_request_pro(
  _plan text DEFAULT 'pro',
  _term text DEFAULT 'month'
)
RETURNS TABLE (
  requested_at timestamptz, requested_plan text, requested_term text, was_new boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _when timestamptz;
  _had_plan text;
  _had_term text;
  _exists boolean;
  _want text := lower(coalesce(nullif(trim(_plan), ''), 'pro'));
  _for  text := lower(coalesce(nullif(trim(_term), ''), 'month'));
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING errcode = '28000';
  END IF;
  IF _want NOT IN ('plus', 'pro') THEN
    RAISE EXCEPTION 'Unknown plan: %', _plan USING errcode = '22023';
  END IF;
  IF _for NOT IN ('month', 'half', 'year') THEN
    RAISE EXCEPTION 'Unknown term: %', _term USING errcode = '22023';
  END IF;

  SELECT true, t.pro_requested_at, t.pro_requested_plan, t.pro_requested_term
    INTO _exists, _when, _had_plan, _had_term
    FROM public.tesoro_users t WHERE t.auth_uid = _uid;
  IF NOT coalesce(_exists, false) THEN
    RAISE EXCEPTION 'No account for this sign-in.' USING errcode = 'P0002';
  END IF;

  IF public.is_tesoro_pro(_uid) THEN
    RETURN QUERY SELECT NULL::timestamptz, NULL::text, NULL::text, false;
    RETURN;
  END IF;

  -- A first ask records the date. Changing the plan or the term keeps that
  -- date: it is the same person still waiting, not a second request.
  IF _when IS NULL THEN
    _when := now();
    UPDATE public.tesoro_users
       SET pro_requested_at = _when, pro_requested_plan = _want, pro_requested_term = _for
     WHERE auth_uid = _uid;
    RETURN QUERY SELECT _when, _want, _for, true;
  ELSIF _had_plan IS DISTINCT FROM _want OR _had_term IS DISTINCT FROM _for THEN
    UPDATE public.tesoro_users
       SET pro_requested_plan = _want, pro_requested_term = _for
     WHERE auth_uid = _uid;
    RETURN QUERY SELECT _when, _want, _for, true;
  ELSE
    RETURN QUERY SELECT _when, _had_plan, _had_term, false;
  END IF;
END;
$function$;

DROP FUNCTION IF EXISTS public.tesoro_request_pro(text);

REVOKE ALL ON FUNCTION public.tesoro_request_pro(text, text) FROM public;
REVOKE ALL ON FUNCTION public.tesoro_request_pro(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.tesoro_request_pro(text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE FUNCTION public.admin_list_users()
RETURNS TABLE (
  sno bigint, user_id text, auth_uid uuid, first_name text, last_name text,
  email_id text, dob date, is_admin boolean, is_approved boolean, is_owner boolean,
  is_pro boolean, pro_since date, pro_until date, over_limit_since date,
  pro_requested_at timestamptz, pro_requested_plan text, pro_requested_term text,
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
    t.pro_requested_at, t.pro_requested_plan, t.pro_requested_term,
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
  IF has_function_privilege('anon', 'public.tesoro_request_pro(text, text)', 'execute') THEN
    RAISE EXCEPTION 'CHECK: anon should not be able to ask for a plan';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.tesoro_request_pro(text, text)', 'execute') THEN
    RAISE EXCEPTION 'CHECK: a signed-in account should be able to ask for a plan';
  END IF;
  -- The old one-argument form must be gone, or a stale client would write a
  -- request with no term on it and nobody would know what to charge.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'tesoro_request_pro'
       AND p.pronargs < 2
  ) THEN
    RAISE EXCEPTION 'CHECK: the termless tesoro_request_pro is still callable';
  END IF;
  RAISE NOTICE 'All checks passed.';
END $$;
