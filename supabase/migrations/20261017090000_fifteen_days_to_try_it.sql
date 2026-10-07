-- ---------------------------------------------------------------------------
-- Fifteen days of Pro, once, without asking anybody.
--
-- Asking for a plan is a conversation with an admin and an email with a
-- payment link in it. A trial is neither: the account turns it on itself, gets
-- everything for fifteen days, and on the sixteenth it is free again with
-- nothing to switch off and nobody to tell.
--
-- One column carries it. The end is current_date against the start plus the
-- length rather than a second stored date, so there is no pair that can
-- disagree, and no row to tidy up when the trial runs out: the arithmetic
-- stops saying Pro on its own.
-- ---------------------------------------------------------------------------

-- What every account reads as now, so the checks can prove this migration
-- moved nobody who was not starting a trial.
CREATE TEMP TABLE _before ON COMMIT DROP AS
SELECT auth_uid, public.tesoro_plan(auth_uid) AS plan
  FROM public.tesoro_users WHERE auth_uid IS NOT NULL;

ALTER TABLE public.tesoro_users ADD COLUMN IF NOT EXISTS trial_started_on date;

COMMENT ON COLUMN public.tesoro_users.trial_started_on IS
  'The day the free trial was started. Once per account; never cleared, so it is also the record that one was used.';

CREATE OR REPLACE FUNCTION public.tesoro_trial_days()
RETURNS integer LANGUAGE sql IMMUTABLE
AS $$ SELECT 15 $$;

COMMENT ON FUNCTION public.tesoro_trial_days() IS
  'How many days a trial runs, counting the day it starts.';

-- ---------------------------------------------------------------------------
-- The one place a tier is decided, now with a third way to be Pro.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tesoro_plan(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN t.is_owner THEN 'pro'
    -- A paid plan first: somebody who buys Plus halfway through a trial is on
    -- Plus, and reading the trial first would quietly give them Pro for the
    -- rest of the fortnight.
    WHEN t.is_pro AND t.pro_plan IS NOT NULL
         AND (t.pro_since IS NULL OR t.pro_until >= current_date) THEN t.pro_plan
    -- Fifteen days counting the day it started, so the sixteenth is free.
    WHEN t.trial_started_on IS NOT NULL
         AND current_date < t.trial_started_on + public.tesoro_trial_days() THEN 'pro'
    ELSE 'free'
  END
  FROM public.tesoro_users t WHERE t.auth_uid = _uid;
$$;

COMMENT ON FUNCTION public.tesoro_plan(uuid) IS
  'free, plus or pro, today. The one place a tier is decided: owner, then a paid plan, then a running trial.';

-- ---------------------------------------------------------------------------
-- Starting one, from the account's own session.
--
-- Security definer for the same reason tesoro_request_pro is: the rule that it
-- happens once belongs in one place, not in whatever the browser remembers.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tesoro_start_trial()
RETURNS TABLE (started_on date, was_new boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _started date;
  _exists boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING errcode = '28000';
  END IF;

  SELECT true, t.trial_started_on INTO _exists, _started
    FROM public.tesoro_users t WHERE t.auth_uid = _uid;
  IF NOT coalesce(_exists, false) THEN
    RAISE EXCEPTION 'No account for this sign-in.' USING errcode = 'P0002';
  END IF;

  -- Already used, whether it is still running or ended months ago. The date
  -- comes back either way so the screen can say which.
  IF _started IS NOT NULL THEN
    RETURN QUERY SELECT _started, false;
    RETURN;
  END IF;

  UPDATE public.tesoro_users SET trial_started_on = current_date WHERE auth_uid = _uid;
  RETURN QUERY SELECT current_date, true;
END;
$function$;

REVOKE ALL ON FUNCTION public.tesoro_start_trial() FROM public;
REVOKE ALL ON FUNCTION public.tesoro_start_trial() FROM anon;
GRANT EXECUTE ON FUNCTION public.tesoro_start_trial() TO authenticated;

COMMENT ON FUNCTION public.tesoro_start_trial() IS
  'An account starts its one free trial. Returns the start date and whether this call made it.';

-- The admin screens read the column like any other.
DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE FUNCTION public.admin_list_users()
RETURNS TABLE (
  sno bigint, user_id text, auth_uid uuid, first_name text, last_name text,
  email_id text, dob date, is_admin boolean, is_approved boolean, is_owner boolean,
  is_pro boolean, pro_plan text, pro_months integer,
  pro_since date, pro_until date, over_limit_since date, trial_started_on date,
  pro_requested_at timestamptz, pro_requested_plan text, pro_requested_term text,
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
  -- Nobody has a trial yet, so nobody's tier may have moved.
  SELECT count(*) INTO _n
    FROM _before b JOIN public.tesoro_users t ON t.auth_uid = b.auth_uid
   WHERE b.plan IS DISTINCT FROM public.tesoro_plan(t.auth_uid);
  IF _n > 0 THEN
    RAISE EXCEPTION 'CHECK: % accounts changed tier across this migration', _n;
  END IF;

  IF public.tesoro_trial_days() <> 15 THEN
    RAISE EXCEPTION 'CHECK: the trial is not fifteen days';
  END IF;

  -- The boundary the whole thing turns on: the day it starts counts, and the
  -- sixteenth day does not.
  IF NOT (date '2026-10-07' < date '2026-10-07' + public.tesoro_trial_days()) THEN
    RAISE EXCEPTION 'CHECK: a trial does not work on the day it starts';
  END IF;
  IF NOT (date '2026-10-21' < date '2026-10-07' + public.tesoro_trial_days()) THEN
    RAISE EXCEPTION 'CHECK: a trial stops before its fifteenth day';
  END IF;
  IF (date '2026-10-22' < date '2026-10-07' + public.tesoro_trial_days()) THEN
    RAISE EXCEPTION 'CHECK: a trial is still running on the sixteenth day';
  END IF;

  IF has_function_privilege('anon', 'public.tesoro_start_trial()', 'execute') THEN
    RAISE EXCEPTION 'CHECK: anon should not be able to start a trial';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.tesoro_start_trial()', 'execute') THEN
    RAISE EXCEPTION 'CHECK: a signed-in account should be able to start a trial';
  END IF;

  RAISE NOTICE 'All checks passed.';
END $$;
