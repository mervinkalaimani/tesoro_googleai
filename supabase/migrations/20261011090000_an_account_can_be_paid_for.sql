-- ---------------------------------------------------------------------------
-- A second axis of privilege: who has paid.
--
-- is_admin and is_owner say who may edit the shared catalogue. They say nothing
-- about how much of the app a person gets, and charging for Tesoro needs that
-- second thing: Pro, which is every section and an unlimited collection, and
-- free, which is fifty cars and no card scanner.
--
-- Three columns and two functions. The functions are the walls -- the insert
-- policy below calls one of them, so the fifty-car ceiling is the database's
-- answer rather than the browser's, and a console cannot lift it.
--
-- pro_since NULL means Pro with no clock. That is not an oversight, it is the
-- backfill: the accounts that existed before the tiers did are comped, and if
-- they were given a start date instead they would every one of them lapse in a
-- month and have their collections trimmed to fifty cars a fortnight later.
-- Only a dated subscription expires.
-- ---------------------------------------------------------------------------

ALTER TABLE public.tesoro_users
  ADD COLUMN IF NOT EXISTS is_pro boolean NOT NULL DEFAULT false;

ALTER TABLE public.tesoro_users
  ADD COLUMN IF NOT EXISTS pro_since date;

-- Generated rather than stored twice: "one month from the start" is arithmetic,
-- and the client reading it is the same answer as the policy enforcing it.
ALTER TABLE public.tesoro_users
  ADD COLUMN IF NOT EXISTS pro_until date
  GENERATED ALWAYS AS (pro_since + INTERVAL '1 month') STORED;

-- When this account first went over the free limit. The sweep sets it, the
-- sweep clears it, and fifteen days after it the excess is archived.
ALTER TABLE public.tesoro_users
  ADD COLUMN IF NOT EXISTS over_limit_since date;

COMMENT ON COLUMN public.tesoro_users.pro_since IS
  'Start of the paid month. NULL with is_pro means comped: Pro, no expiry.';
COMMENT ON COLUMN public.tesoro_users.over_limit_since IS
  'When a free account first held more than 50 cars. NULL when no clock is running.';

-- Everybody who is already here keeps everything they have, with no end date.
UPDATE public.tesoro_users
   SET is_pro = true
 WHERE (is_approved OR is_owner) AND NOT is_pro;

-- ---------------------------------------------------------------------------
-- Archived rather than deleted.
--
-- A collection trimmed to fit is hidden, not destroyed: the rows stay, the app
-- filters them out, and going Pro brings every one of them back. Nothing in
-- this project removes a person's cars on a timer, and nothing should.
-- ---------------------------------------------------------------------------

ALTER TABLE public.tesoro_raw
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.tesoro_raw.archived_at IS
  'Set by the free-tier sweep. The row is hidden from the app and restored on upgrade.';

-- The ceiling counts live rows per owner, so that is the index it gets.
CREATE INDEX IF NOT EXISTS tesoro_raw_live_by_owner_idx
  ON public.tesoro_raw (user_id)
  WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- The two questions everything else asks.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_tesoro_pro(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tesoro_users
    WHERE auth_uid = _uid
      AND (
        is_owner
        -- pro_until is the last day it works, not the first day it does not.
        OR (is_pro AND (pro_since IS NULL OR pro_until >= current_date))
      )
  );
$$;

COMMENT ON FUNCTION public.is_tesoro_pro(uuid) IS
  'Whether this account is on Pro today. The owner always is; a comped account has no end date.';

CREATE OR REPLACE FUNCTION public.tesoro_free_car_limit()
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 50 $$;

COMMENT ON FUNCTION public.tesoro_free_car_limit() IS
  'How many cars a free account keeps. Mirrors FREE_CAR_LIMIT in src/lib/tiers.ts.';

CREATE OR REPLACE FUNCTION public.tesoro_within_car_limit(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Pro first, deliberately: OR short-circuits, so a Pro account importing five
  -- hundred rows pays one lookup per row and never the count. Only a free
  -- account is counted, and only ever up to fifty.
  SELECT public.is_tesoro_pro(_uid)
      OR (
        SELECT count(*) FROM public.tesoro_raw
         WHERE user_id = _uid AND archived_at IS NULL
      ) < public.tesoro_free_car_limit();
$$;

COMMENT ON FUNCTION public.tesoro_within_car_limit(uuid) IS
  'False once a free account holds 50 live cars. Archived rows do not count, or a trimmed account could never add again.';

-- ---------------------------------------------------------------------------
-- The wall itself.
--
-- Insert only. Update and delete are left alone on purpose: somebody over the
-- line can still correct what they have and remove what they do not want, and
-- taking that away would trap them above a limit they cannot get under.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owners insert own cars" ON public.tesoro_raw;
CREATE POLICY "Owners insert own cars" ON public.tesoro_raw
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.is_tesoro_approved(auth.uid())
    AND public.tesoro_within_car_limit(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- The fifteen days.
--
-- A collection that drops to free over the limit is not cut down on the spot.
-- A clock starts, the app says so every day it is running, and at the end the
-- excess is put away -- archived, not deleted, oldest fifty kept, and handed
-- straight back the moment the account is Pro again.
--
-- Nothing calls this yet. A later migration schedules it, once its dry run has
-- been read: the first thing in this project that takes somebody's cars off
-- their screen on a timer should not also be the first thing nobody looked at.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tesoro_enforce_free_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- 1. Start the clock on anybody newly over the line.
  UPDATE public.tesoro_users t
     SET over_limit_since = current_date
   WHERE t.over_limit_since IS NULL
     AND t.auth_uid IS NOT NULL
     AND NOT public.is_tesoro_pro(t.auth_uid)
     AND (SELECT count(*) FROM public.tesoro_raw c
           WHERE c.user_id = t.auth_uid AND c.archived_at IS NULL)
         > public.tesoro_free_car_limit();

  -- 2. Pro gives everything back, in full, before anything else is considered.
  UPDATE public.tesoro_raw c
     SET archived_at = NULL
    FROM public.tesoro_users t
   WHERE c.user_id = t.auth_uid
     AND c.archived_at IS NOT NULL
     AND public.is_tesoro_pro(t.auth_uid);

  -- ...and the clock stops for anyone who is Pro, or back under the line.
  UPDATE public.tesoro_users t
     SET over_limit_since = NULL
   WHERE t.over_limit_since IS NOT NULL
     AND t.auth_uid IS NOT NULL
     AND (
       public.is_tesoro_pro(t.auth_uid)
       OR (SELECT count(*) FROM public.tesoro_raw c
            WHERE c.user_id = t.auth_uid AND c.archived_at IS NULL)
          <= public.tesoro_free_car_limit()
     );

  -- 3. Fifteen days up: keep the oldest fifty, put the rest away.
  WITH due AS (
    SELECT t.auth_uid
      FROM public.tesoro_users t
     WHERE t.over_limit_since IS NOT NULL
       AND t.auth_uid IS NOT NULL
       AND t.over_limit_since + 15 <= current_date
       AND NOT public.is_tesoro_pro(t.auth_uid)
  ),
  ranked AS (
    -- SNO is the identity column, so ascending SNO is the order they were
    -- actually added. The fifty kept are the fifty held longest.
    SELECT c."SNO",
           row_number() OVER (PARTITION BY c.user_id ORDER BY c."SNO") AS rn
      FROM public.tesoro_raw c
      JOIN due d ON d.auth_uid = c.user_id
     WHERE c.archived_at IS NULL
  )
  UPDATE public.tesoro_raw r
     SET archived_at = now()
    FROM ranked
   WHERE r."SNO" = ranked."SNO"
     AND ranked.rn > public.tesoro_free_car_limit();
END;
$function$;

COMMENT ON FUNCTION public.tesoro_enforce_free_limits() IS
  'Daily: starts and stops the 15-day clock, restores archived cars on upgrade, and archives the excess when it runs out.';

-- The same arithmetic, changing nothing. Read this before scheduling the sweep.
CREATE OR REPLACE FUNCTION public.tesoro_free_limit_report()
RETURNS TABLE (
  email_id text, is_pro boolean, pro_until date, live_cars bigint,
  over_limit_since date, trims_on date, would_archive bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    t.email_id,
    public.is_tesoro_pro(t.auth_uid),
    t.pro_until,
    (SELECT count(*) FROM public.tesoro_raw c
      WHERE c.user_id = t.auth_uid AND c.archived_at IS NULL),
    t.over_limit_since,
    t.over_limit_since + 15,
    GREATEST(
      (SELECT count(*) FROM public.tesoro_raw c
        WHERE c.user_id = t.auth_uid AND c.archived_at IS NULL)
      - public.tesoro_free_car_limit(), 0)
  FROM public.tesoro_users t
  WHERE t.auth_uid IS NOT NULL
  ORDER BY t.sno;
$function$;

-- ---------------------------------------------------------------------------
-- What the admin screen reads.
--
-- The return table is declared, so a column added to tesoro_users does not
-- appear here on its own. car_count counts live rows only: an archived car is
-- not one this account is holding, and the ceiling does not count it either.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE FUNCTION public.admin_list_users()
RETURNS TABLE (
  sno bigint, user_id text, auth_uid uuid, first_name text, last_name text,
  email_id text, dob date, is_admin boolean, is_approved boolean, is_owner boolean,
  is_pro boolean, pro_since date, pro_until date, over_limit_since date,
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

-- ---------------------------------------------------------------------------
-- Checks.
--
-- Read-only, and that is a constraint rather than a choice: tesoro_users.auth_uid
-- and tesoro_raw.user_id are both foreign keys into auth.users, so a check that
-- wanted a free account to try the ceiling against would have to invent a
-- sign-in to hang it on. These ask the real rows instead, and the arithmetic is
-- asked directly.
--
-- The ceiling and the expiry boundary are covered from the other side, in
-- src/lib/tiers.selfcheck.ts, and by the queries run against this database
-- immediately after the migration lands.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  _n int;
BEGIN
  -- The limit is the number the app says it is.
  IF public.tesoro_free_car_limit() <> 50 THEN
    RAISE EXCEPTION 'CHECK: the free limit should be 50, it is %', public.tesoro_free_car_limit();
  END IF;

  -- Nobody who was already here was left behind by the backfill.
  SELECT count(*) INTO _n FROM public.tesoro_users
   WHERE (is_approved OR is_owner) AND NOT is_pro;
  IF _n > 0 THEN
    RAISE EXCEPTION 'CHECK: % approved accounts were left off Pro', _n;
  END IF;

  -- ...and every one of them reads as Pro today.
  SELECT count(*) INTO _n FROM public.tesoro_users
   WHERE auth_uid IS NOT NULL AND (is_approved OR is_owner)
     AND NOT public.is_tesoro_pro(auth_uid);
  IF _n > 0 THEN
    RAISE EXCEPTION 'CHECK: % approved accounts do not read as Pro', _n;
  END IF;

  -- ...so not one of them is anywhere near the ceiling.
  SELECT count(*) INTO _n FROM public.tesoro_users
   WHERE auth_uid IS NOT NULL AND (is_approved OR is_owner)
     AND NOT public.tesoro_within_car_limit(auth_uid);
  IF _n > 0 THEN
    RAISE EXCEPTION 'CHECK: the new ceiling would refuse a car from % existing accounts', _n;
  END IF;

  -- The month, where it is easy to be a day out: the last day works and the
  -- day after it does not. This is the expression is_tesoro_pro evaluates.
  IF NOT ((current_date - INTERVAL '1 month')::date + INTERVAL '1 month' >= current_date) THEN
    RAISE EXCEPTION 'CHECK: pro_until should still be Pro on its own day';
  END IF;
  IF ((current_date - INTERVAL '1 month 1 day')::date + INTERVAL '1 month' >= current_date) THEN
    RAISE EXCEPTION 'CHECK: the day after pro_until should not be Pro';
  END IF;

  -- A comped account is one with no date, and the arithmetic above never runs
  -- for it. Nothing archived exists yet, so the sweep has nothing to undo.
  SELECT count(*) INTO _n FROM public.tesoro_raw WHERE archived_at IS NOT NULL;
  IF _n > 0 THEN
    RAISE EXCEPTION 'CHECK: % rows are archived before anything has run', _n;
  END IF;

  RAISE NOTICE 'All checks passed.';
END $$;
