-- A trial opens the Pro sections. It does not raise the car ceiling: fifty
-- cars added on a trial that is not taken up are fifty cars put away fifteen
-- days later, and a feature that hands somebody their own collection back
-- missing is not a trial, it is a trap.
--
-- So the ceiling stops asking what tier the account reads as and asks what it
-- has paid for. The paid answer is its own function, used by both, so there is
-- still one place the rule about plans and dates lives.

CREATE TEMP TABLE _before ON COMMIT DROP AS
SELECT auth_uid, public.tesoro_plan(auth_uid) AS plan, public.tesoro_car_ceiling(auth_uid) AS ceiling
  FROM public.tesoro_users WHERE auth_uid IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tesoro_paid_plan(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN t.is_owner THEN 'pro'
    WHEN t.is_pro AND t.pro_plan IS NOT NULL
         AND (t.pro_since IS NULL OR t.pro_until >= current_date) THEN t.pro_plan
    ELSE 'free'
  END
  FROM public.tesoro_users t WHERE t.auth_uid = _uid;
$$;

COMMENT ON FUNCTION public.tesoro_paid_plan(uuid) IS
  'What this account has paid for today, ignoring any trial. The ceiling is read off this.';

CREATE OR REPLACE FUNCTION public.tesoro_plan(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN public.tesoro_paid_plan(_uid) <> 'free' THEN public.tesoro_paid_plan(_uid)
    WHEN (SELECT t.trial_started_on IS NOT NULL
                 AND current_date < t.trial_started_on + public.tesoro_trial_days()
            FROM public.tesoro_users t WHERE t.auth_uid = _uid) THEN 'pro'
    ELSE 'free'
  END;
$$;

COMMENT ON FUNCTION public.tesoro_plan(uuid) IS
  'free, plus or pro, today: what was paid for, else Pro while a trial runs. What the sections ask.';

CREATE OR REPLACE FUNCTION public.tesoro_car_ceiling(_uid uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- Deliberately the paid plan and not the tier: a trial does not raise this.
  SELECT CASE public.tesoro_paid_plan(_uid)
    WHEN 'pro' THEN NULL
    WHEN 'plus' THEN public.tesoro_free_car_limit() + 100
    ELSE public.tesoro_free_car_limit()
  END;
$$;

COMMENT ON FUNCTION public.tesoro_car_ceiling(uuid) IS
  'How many live cars this account may hold, from what it has paid for. NULL is unlimited. A trial does not change it.';

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n
    FROM _before b JOIN public.tesoro_users t ON t.auth_uid = b.auth_uid
   WHERE b.plan IS DISTINCT FROM public.tesoro_plan(t.auth_uid)
      OR b.ceiling IS DISTINCT FROM public.tesoro_car_ceiling(t.auth_uid);
  IF _n > 0 THEN
    RAISE EXCEPTION 'CHECK: % accounts changed tier or ceiling across this migration', _n;
  END IF;

  IF (SELECT count(*) FROM public.tesoro_users WHERE trial_started_on IS NOT NULL) > 0 THEN
    RAISE NOTICE 'Trials exist; their ceilings are now the free limit.';
  END IF;

  RAISE NOTICE 'All checks passed.';
END $$;
