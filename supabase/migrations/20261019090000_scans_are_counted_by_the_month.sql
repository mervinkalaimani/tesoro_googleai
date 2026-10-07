-- Scanning a card was Pro or nothing. It is an allowance now: ten a month on
-- free, twenty on Plus, as many as you like on Pro.
--
-- Counted in the database rather than the browser, because every scan spends
-- somebody's API key and a limit the devtools console can reset is not a
-- limit. The month is stored beside the count, so the reset happens when
-- somebody asks rather than needing a job that remembers to run.

ALTER TABLE public.tesoro_users ADD COLUMN IF NOT EXISTS scan_month date;
ALTER TABLE public.tesoro_users ADD COLUMN IF NOT EXISTS scans_used integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.tesoro_users.scan_month IS
  'The month scans_used counts. The first of the month; a different one means the count is stale.';
COMMENT ON COLUMN public.tesoro_users.scans_used IS
  'Card scans taken in scan_month. Reset by the first claim of a new month.';

CREATE OR REPLACE FUNCTION public.tesoro_scan_allowance(_uid uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  -- The tier rather than the paid plan: a trial is meant to be the whole app,
  -- and the ceiling it must not move is the one on somebody's own cars.
  SELECT CASE public.tesoro_plan(_uid)
    WHEN 'pro' THEN NULL
    WHEN 'plus' THEN 20
    ELSE 10
  END;
$$;

COMMENT ON FUNCTION public.tesoro_scan_allowance(uuid) IS
  'Card scans a month for this account. NULL is unlimited.';

CREATE OR REPLACE FUNCTION public.tesoro_claim_scan()
RETURNS TABLE (allowed boolean, used integer, allowance integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _month date := date_trunc('month', current_date)::date;
  _allow integer;
  _used integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING errcode = '28000';
  END IF;

  -- A new month zeroes the count on the way past. Doing it here rather than on
  -- a schedule means there is no day on which the reset can fail to have run.
  UPDATE public.tesoro_users
     SET scans_used = 0, scan_month = _month
   WHERE auth_uid = _uid AND scan_month IS DISTINCT FROM _month;

  SELECT t.scans_used INTO _used FROM public.tesoro_users t WHERE t.auth_uid = _uid;
  IF _used IS NULL THEN
    RAISE EXCEPTION 'No account for this sign-in.' USING errcode = 'P0002';
  END IF;

  _allow := public.tesoro_scan_allowance(_uid);

  IF _allow IS NOT NULL AND _used >= _allow THEN
    RETURN QUERY SELECT false, _used, _allow;
    RETURN;
  END IF;

  UPDATE public.tesoro_users SET scans_used = scans_used + 1 WHERE auth_uid = _uid;
  RETURN QUERY SELECT true, _used + 1, _allow;
END;
$function$;

REVOKE ALL ON FUNCTION public.tesoro_claim_scan() FROM public;
REVOKE ALL ON FUNCTION public.tesoro_claim_scan() FROM anon;
GRANT EXECUTE ON FUNCTION public.tesoro_claim_scan() TO authenticated;

COMMENT ON FUNCTION public.tesoro_claim_scan() IS
  'Takes one scan off this month''s allowance. Returns whether it was allowed, and where the count now stands.';

DO $$
DECLARE _n int;
BEGIN
  IF has_function_privilege('anon', 'public.tesoro_claim_scan()', 'execute') THEN
    RAISE EXCEPTION 'CHECK: anon should not be able to spend a scan';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.tesoro_claim_scan()', 'execute') THEN
    RAISE EXCEPTION 'CHECK: a signed-in account should be able to scan';
  END IF;

  SELECT count(*) INTO _n FROM public.tesoro_users WHERE scans_used <> 0;
  IF _n > 0 THEN
    RAISE EXCEPTION 'CHECK: % accounts already have scans counted', _n;
  END IF;

  -- The three allowances, as the rest of the app will state them.
  IF (SELECT count(*) FROM public.tesoro_users t
       WHERE public.tesoro_plan(t.auth_uid) = 'free'
         AND public.tesoro_scan_allowance(t.auth_uid) IS DISTINCT FROM 10) > 0 THEN
    RAISE EXCEPTION 'CHECK: a free account does not get ten scans';
  END IF;
  IF (SELECT count(*) FROM public.tesoro_users t
       WHERE public.tesoro_plan(t.auth_uid) = 'plus'
         AND public.tesoro_scan_allowance(t.auth_uid) IS DISTINCT FROM 20) > 0 THEN
    RAISE EXCEPTION 'CHECK: a Plus account does not get twenty scans';
  END IF;
  IF (SELECT count(*) FROM public.tesoro_users t
       WHERE public.tesoro_plan(t.auth_uid) = 'pro'
         AND public.tesoro_scan_allowance(t.auth_uid) IS NOT NULL) > 0 THEN
    RAISE EXCEPTION 'CHECK: a Pro account has a scan limit';
  END IF;

  RAISE NOTICE 'All checks passed.';
END $$;
