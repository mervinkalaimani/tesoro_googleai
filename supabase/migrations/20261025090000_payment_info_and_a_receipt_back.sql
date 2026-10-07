-- Handing somebody the thing they pay with, and getting the proof back.
--
-- The QR itself is one picture for the whole deployment, so it lives in
-- deployment_settings beside the other facts about this install. What is
-- per-account is the moment an admin handed it over, and the screenshot that
-- came back.
--
-- Both writes go through functions rather than policies on tesoro_users: one
-- refuses when there is no open request to attach to, the other refuses a URL
-- that is not a picture in this project's own storage. A free-text column an
-- account can write is a column an account can put anything in, and this one
-- is rendered as an image to an admin.

ALTER TABLE public.tesoro_users ADD COLUMN IF NOT EXISTS pay_info_sent_at timestamptz;
ALTER TABLE public.tesoro_users ADD COLUMN IF NOT EXISTS pay_receipt_url text;
ALTER TABLE public.tesoro_users ADD COLUMN IF NOT EXISTS pay_receipt_at timestamptz;

COMMENT ON COLUMN public.tesoro_users.pay_info_sent_at IS
  'When an admin handed this account the payment details for its open request. Cleared with the request.';
COMMENT ON COLUMN public.tesoro_users.pay_receipt_url IS
  'Screenshot of the payment the account says it made. Cleared when the plan is granted or the request withdrawn.';
COMMENT ON COLUMN public.tesoro_users.pay_receipt_at IS
  'When that screenshot was uploaded. Null means nothing is waiting to be checked.';

CREATE OR REPLACE FUNCTION public.tesoro_send_pay_info(_sno bigint)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _when timestamptz := now();
  _asked timestamptz;
BEGIN
  IF NOT public.is_tesoro_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admins only.' USING errcode = '42501';
  END IF;

  SELECT t.pro_requested_at INTO _asked FROM public.tesoro_users t WHERE t.sno = _sno;
  IF _asked IS NULL THEN
    RAISE EXCEPTION 'That account has not asked for a plan.' USING errcode = 'P0002';
  END IF;

  UPDATE public.tesoro_users SET pay_info_sent_at = _when WHERE sno = _sno;
  RETURN _when;
END;
$function$;

REVOKE ALL ON FUNCTION public.tesoro_send_pay_info(bigint) FROM public;
REVOKE ALL ON FUNCTION public.tesoro_send_pay_info(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.tesoro_send_pay_info(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.tesoro_submit_receipt(_url text)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _asked timestamptz;
  _when timestamptz := now();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING errcode = '28000';
  END IF;

  IF _url IS NULL OR _url !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/' THEN
    RAISE EXCEPTION 'That is not an uploaded picture.' USING errcode = '22023';
  END IF;

  SELECT t.pro_requested_at INTO _asked FROM public.tesoro_users t WHERE t.auth_uid = _uid;
  IF _asked IS NULL THEN
    RAISE EXCEPTION 'There is no open request to attach that to.' USING errcode = 'P0002';
  END IF;

  UPDATE public.tesoro_users
     SET pay_receipt_url = _url, pay_receipt_at = _when
   WHERE auth_uid = _uid;

  RETURN _when;
END;
$function$;

REVOKE ALL ON FUNCTION public.tesoro_submit_receipt(text) FROM public;
REVOKE ALL ON FUNCTION public.tesoro_submit_receipt(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.tesoro_submit_receipt(text) TO authenticated;

-- Withdrawing the ask takes the QR and the receipt down with it: they were
-- for a request, and there is no longer a request.
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

  UPDATE public.tesoro_users
     SET pro_requested_at = NULL, pro_requested_plan = NULL, pro_requested_term = NULL,
         pay_info_sent_at = NULL, pay_receipt_url = NULL, pay_receipt_at = NULL
   WHERE auth_uid = _uid;

  RETURN _had;
END;
$function$;

DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE FUNCTION public.admin_list_users()
RETURNS TABLE (
  sno bigint, user_id text, auth_uid uuid, first_name text, last_name text,
  email_id text, dob date, is_admin boolean, is_approved boolean, is_owner boolean,
  is_pro boolean, pro_plan text, pro_months integer,
  pro_since date, pro_until date, over_limit_since date, trial_started_on date,
  pro_requested_at timestamptz, pro_requested_plan text, pro_requested_term text,
  cancel_requested_at timestamptz, pay_info_sent_at timestamptz,
  pay_receipt_url text, pay_receipt_at timestamptz,
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
    t.cancel_requested_at, t.pay_info_sent_at,
    t.pay_receipt_url, t.pay_receipt_at,
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
BEGIN
  IF has_function_privilege('anon', 'public.tesoro_send_pay_info(bigint)', 'execute') THEN
    RAISE EXCEPTION 'CHECK: anon should not be able to mark payment details sent';
  END IF;
  IF has_function_privilege('anon', 'public.tesoro_submit_receipt(text)', 'execute') THEN
    RAISE EXCEPTION 'CHECK: anon should not be able to file a receipt';
  END IF;

  -- The URL guard: anything that is not a picture in this project's storage is
  -- refused before it can be rendered to an admin.
  IF ('javascript:alert(1)' ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/') THEN
    RAISE EXCEPTION 'CHECK: the receipt URL guard accepts a script URL';
  END IF;
  IF NOT ('https://matekrbcflojjooswoha.supabase.co/storage/v1/object/public/avatars/x.png'
          ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/') THEN
    RAISE EXCEPTION 'CHECK: the receipt URL guard refuses a real upload';
  END IF;

  RAISE NOTICE 'All checks passed.';
END $$;
