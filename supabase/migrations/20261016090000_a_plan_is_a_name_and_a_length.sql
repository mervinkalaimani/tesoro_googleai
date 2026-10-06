-- ---------------------------------------------------------------------------
-- Which plan, and for how many months.
--
-- is_pro was a boolean, which could say paid or not paid and nothing else.
-- Plus is a real tier now -- a hundred and fifty cars, and none of the Pro
-- sections -- so paid is no longer one thing, and the plan has to be a name.
--
-- pro_until was generated as one month from the start. An admin granting six
-- months had nowhere to put the six, so the length is a column and the end is
-- computed from it. The generated column is replaced rather than kept, because
-- two ways of working out when a subscription ends is one too many.
-- ---------------------------------------------------------------------------

-- What each account reads as before any of this, so the checks at the end can
-- prove nobody's tier moved underneath them.
CREATE TEMP TABLE _before ON COMMIT DROP AS
SELECT auth_uid,
       (is_pro AND (pro_since IS NULL OR pro_until >= current_date)) AS was_pro
  FROM public.tesoro_users
 WHERE auth_uid IS NOT NULL;

ALTER TABLE public.tesoro_users ADD COLUMN IF NOT EXISTS pro_plan text;
ALTER TABLE public.tesoro_users DROP CONSTRAINT IF EXISTS tesoro_users_pro_plan_check;
ALTER TABLE public.tesoro_users
  ADD CONSTRAINT tesoro_users_pro_plan_check
  CHECK (pro_plan IS NULL OR pro_plan IN ('plus', 'pro'));

ALTER TABLE public.tesoro_users ADD COLUMN IF NOT EXISTS pro_months integer NOT NULL DEFAULT 1;
ALTER TABLE public.tesoro_users DROP CONSTRAINT IF EXISTS tesoro_users_pro_months_check;
ALTER TABLE public.tesoro_users
  ADD CONSTRAINT tesoro_users_pro_months_check CHECK (pro_months BETWEEN 1 AND 60);

COMMENT ON COLUMN public.tesoro_users.pro_plan IS
  'The paid plan held: plus or pro. NULL is free.';
COMMENT ON COLUMN public.tesoro_users.pro_months IS
  'How many months were granted. pro_until is pro_since plus this.';

-- Everyone already paying holds Pro: it was the only thing is_pro could mean.
UPDATE public.tesoro_users SET pro_plan = 'pro' WHERE is_pro AND pro_plan IS NULL;

-- The end date, from the length rather than from a fixed month.
ALTER TABLE public.tesoro_users DROP COLUMN IF EXISTS pro_until;
ALTER TABLE public.tesoro_users
  ADD COLUMN pro_until date
  GENERATED ALWAYS AS (pro_since + make_interval(months => coalesce(pro_months, 1))) STORED;

COMMENT ON COLUMN public.tesoro_users.pro_until IS
  'Last day the plan works. Generated: pro_since plus pro_months. NULL means comped, no expiry.';

-- ---------------------------------------------------------------------------
-- One answer to "what is this account on".
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tesoro_plan(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN t.is_owner THEN 'pro'
    WHEN NOT t.is_pro OR t.pro_plan IS NULL THEN 'free'
    -- pro_until is the last day it works, not the first day it does not. A
    -- comped account has no pro_since, so no end date, so it never lapses.
    WHEN t.pro_since IS NOT NULL AND t.pro_until < current_date THEN 'free'
    ELSE t.pro_plan
  END
  FROM public.tesoro_users t WHERE t.auth_uid = _uid;
$$;

COMMENT ON FUNCTION public.tesoro_plan(uuid) IS
  'free, plus or pro, today. The one place a tier is decided.';

CREATE OR REPLACE FUNCTION public.is_tesoro_pro(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- Only Pro opens the Pro sections and the scanner. Plus buys cars.
  SELECT coalesce(public.tesoro_plan(_uid) = 'pro', false);
$$;

CREATE OR REPLACE FUNCTION public.tesoro_car_ceiling(_uid uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- NULL is no ceiling. Plus is the free limit and another hundred.
  SELECT CASE public.tesoro_plan(_uid)
    WHEN 'pro' THEN NULL
    WHEN 'plus' THEN public.tesoro_free_car_limit() + 100
    ELSE public.tesoro_free_car_limit()
  END;
$$;

COMMENT ON FUNCTION public.tesoro_car_ceiling(uuid) IS
  'How many live cars this account may hold. NULL is unlimited.';

CREATE OR REPLACE FUNCTION public.tesoro_within_car_limit(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- The ceiling first, deliberately: a Pro account has none, so it never pays
  -- for the count. Archived rows are not counted, or a trimmed account could
  -- never add again.
  SELECT public.tesoro_car_ceiling(_uid) IS NULL
      OR (SELECT count(*) FROM public.tesoro_raw
           WHERE user_id = _uid AND archived_at IS NULL) < public.tesoro_car_ceiling(_uid);
$$;

DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE FUNCTION public.admin_list_users()
RETURNS TABLE (
  sno bigint, user_id text, auth_uid uuid, first_name text, last_name text,
  email_id text, dob date, is_admin boolean, is_approved boolean, is_owner boolean,
  is_pro boolean, pro_plan text, pro_months integer,
  pro_since date, pro_until date, over_limit_since date,
  pro_requested_at timestamptz, pro_requested_plan text, pro_requested_term text,
  created_at timestamptz, car_count bigint, last_sign_in timestamptz, rejected_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  SELECT
    t.sno, t.user_id, t.auth_uid, t.first_name, t.last_name, t.email_id, t.dob,
    t.is_admin, t.is_approved, t.is_owner,
    t.is_pro, t.pro_plan, t.pro_months,
    t.pro_since, t.pro_until, t.over_limit_since,
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
  -- Nobody paying was left without a plan name.
  SELECT count(*) INTO _n FROM public.tesoro_users
   WHERE is_pro AND pro_plan IS DISTINCT FROM 'pro';
  IF _n > 0 THEN
    RAISE EXCEPTION 'CHECK: % paying accounts have no plan name', _n;
  END IF;

  -- The invariant is that nobody's tier moved, not that everybody is Pro:
  -- accounts get turned off, and a check that assumed otherwise would fail for
  -- a reason that has nothing to do with this change.
  SELECT count(*) INTO _n
    FROM _before b JOIN public.tesoro_users t ON t.auth_uid = b.auth_uid
   WHERE b.was_pro IS DISTINCT FROM (public.tesoro_plan(t.auth_uid) = 'pro');
  IF _n > 0 THEN
    RAISE EXCEPTION 'CHECK: % accounts changed tier across this migration', _n;
  END IF;

  -- Nobody is over the ceiling they now have.
  SELECT count(*) INTO _n FROM public.tesoro_users
   WHERE auth_uid IS NOT NULL AND is_approved
     AND NOT public.tesoro_within_car_limit(auth_uid);
  IF _n > 0 THEN
    RAISE EXCEPTION 'CHECK: the ceiling would refuse a car from % accounts', _n;
  END IF;

  IF public.tesoro_free_car_limit() <> 50 THEN
    RAISE EXCEPTION 'CHECK: the free limit moved';
  END IF;

  -- Six months is six months, not one.
  IF (date '2026-01-10' + make_interval(months => 6)) <> date '2026-07-10' THEN
    RAISE EXCEPTION 'CHECK: the end date is not the start plus its months';
  END IF;

  RAISE NOTICE 'All checks passed.';
END $$;
