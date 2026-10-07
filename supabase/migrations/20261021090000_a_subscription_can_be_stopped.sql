-- Stopping a subscription.
--
-- Nothing is charged automatically, so this is not a cancellation in the
-- billing sense: it is the account saying it will not be renewing, which is
-- the only thing there is to say when the renewal is an admin typing a date.
--
-- It takes nothing away. The plan runs to pro_until exactly as it would have,
-- and tesoro_plan() lets it lapse on its own the day after -- so "you keep
-- everything until the end day" is not a promise the screen is making on its
-- own, it is what the date arithmetic already does.

ALTER TABLE public.tesoro_users ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz;

COMMENT ON COLUMN public.tesoro_users.cancel_requested_at IS
  'When this account said it would not renew. Takes nothing away: the plan still runs to pro_until.';

CREATE OR REPLACE FUNCTION public.tesoro_set_cancel(_on boolean)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _when timestamptz;
  _exists boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING errcode = '28000';
  END IF;

  SELECT true, t.cancel_requested_at INTO _exists, _when
    FROM public.tesoro_users t WHERE t.auth_uid = _uid;
  IF NOT coalesce(_exists, false) THEN
    RAISE EXCEPTION 'No account for this sign-in.' USING errcode = 'P0002';
  END IF;

  IF _on THEN
    -- Saying it twice does not move the date it was first said on.
    IF _when IS NULL THEN
      _when := now();
      UPDATE public.tesoro_users SET cancel_requested_at = _when WHERE auth_uid = _uid;
    END IF;
    RETURN _when;
  END IF;

  -- Changing your mind is the same button, and leaves no trace: an account
  -- that is staying is not an account that nearly left.
  UPDATE public.tesoro_users SET cancel_requested_at = NULL WHERE auth_uid = _uid;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.tesoro_set_cancel(boolean) FROM public;
REVOKE ALL ON FUNCTION public.tesoro_set_cancel(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.tesoro_set_cancel(boolean) TO authenticated;

COMMENT ON FUNCTION public.tesoro_set_cancel(boolean) IS
  'An account says whether it is renewing. Returns the date it said it would not, or null.';

-- The admin screen needs to know not to renew somebody.
DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE FUNCTION public.admin_list_users()
RETURNS TABLE (
  sno bigint, user_id text, auth_uid uuid, first_name text, last_name text,
  email_id text, dob date, is_admin boolean, is_approved boolean, is_owner boolean,
  is_pro boolean, pro_plan text, pro_months integer,
  pro_since date, pro_until date, over_limit_since date, trial_started_on date,
  pro_requested_at timestamptz, pro_requested_plan text, pro_requested_term text,
  cancel_requested_at timestamptz,
  created_at timestamptz, car_count bigint, last_sign_in timestamptz, rejected_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  SELECT
    t.sno, t.user_id, t.auth_uid, t.first_name, t.last_name, t.email_id, t.dob,
    t.is_admin, t.is_approved, t.is_owner,
    t.is_pro, t.pro_plan, t.pro_months,
    t.pro_since, t.pro_until, t.over_limit_since, t.trial_started_on,
    t.pro_requested_at, t.pro_requested_plan, t.pro_requested_term,
    t.cancel_requested_at,
    t.created_at,
    (SELECT count(*) FROM public.tesoro_raw c
      WHERE c.user_id = t.auth_uid AND c.archived_at IS NULL) AS car_count,
    u.last_sign_in_at, t.rejected_at
  FROM public.tesoro_users t
  LEFT JOIN auth.users u ON u.id = t.auth_uid
  WHERE public.is_tesoro_admin(auth.uid())
  ORDER BY t.sno;
$function$;

DO $$
DECLARE _n int;
BEGIN
  IF has_function_privilege('anon', 'public.tesoro_set_cancel(boolean)', 'execute') THEN
    RAISE EXCEPTION 'CHECK: anon should not be able to stop a subscription';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.tesoro_set_cancel(boolean)', 'execute') THEN
    RAISE EXCEPTION 'CHECK: a signed-in account should be able to stop its subscription';
  END IF;

  SELECT count(*) INTO _n FROM public.tesoro_users WHERE cancel_requested_at IS NOT NULL;
  IF _n > 0 THEN
    RAISE EXCEPTION 'CHECK: % accounts already read as leaving', _n;
  END IF;

  RAISE NOTICE 'All checks passed.';
END $$;
