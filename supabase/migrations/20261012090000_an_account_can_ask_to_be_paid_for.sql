-- ---------------------------------------------------------------------------
-- Asking for Pro.
--
-- The button a free account presses tells the admins, and writes the ask down
-- here. A notification is a thing that can be missed, dismissed on the wrong
-- phone, or arrive while nobody is looking; the row is what the admin screen
-- reads, so a request outlives the notification that announced it.
--
-- Cleared when the tier is granted, so the list is only ever people still
-- waiting.
-- ---------------------------------------------------------------------------

ALTER TABLE public.tesoro_users
  ADD COLUMN IF NOT EXISTS pro_requested_at timestamptz;

COMMENT ON COLUMN public.tesoro_users.pro_requested_at IS
  'When this account asked for Pro. Cleared when it is granted.';

DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE FUNCTION public.admin_list_users()
RETURNS TABLE (
  sno bigint, user_id text, auth_uid uuid, first_name text, last_name text,
  email_id text, dob date, is_admin boolean, is_approved boolean, is_owner boolean,
  is_pro boolean, pro_since date, pro_until date, over_limit_since date,
  pro_requested_at timestamptz,
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
    t.pro_requested_at,
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
DECLARE _n int;
BEGIN
  -- Nobody has asked yet, and granting Pro is what clears it.
  SELECT count(*) INTO _n FROM public.tesoro_users WHERE pro_requested_at IS NOT NULL;
  IF _n > 0 THEN
    RAISE EXCEPTION 'CHECK: % requests exist before the button does', _n;
  END IF;
  RAISE NOTICE 'All checks passed.';
END $$;
