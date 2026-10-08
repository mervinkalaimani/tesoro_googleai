-- Asking for a plan is the same moment as being told how to pay for it.
--
-- An admin pressing Send payment info was a step that existed only because
-- the QR was treated as something to be released. It is not: it is a picture
-- of where the money goes, and the person who just chose a plan is exactly
-- the person who should see it. So the ask sends it.
--
-- The admin button stays, because a resend is still worth having -- somebody
-- closes the dialog, or the QR changes -- but nothing waits on it now.

CREATE OR REPLACE FUNCTION public.tesoro_request_pro(_plan text DEFAULT 'pro'::text, _term text DEFAULT 'month'::text)
RETURNS TABLE(requested_at timestamptz, requested_plan text, requested_term text, was_new boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
  --
  -- Either way the payment details go out now. Changing the length changes
  -- the amount, so the QR has to be re-offered against the new one rather
  -- than left showing what was asked for first.
  IF _when IS NULL THEN
    _when := now();
    UPDATE public.tesoro_users
       SET pro_requested_at = _when, pro_requested_plan = _want, pro_requested_term = _for,
           pay_info_sent_at = now()
     WHERE auth_uid = _uid;
    RETURN QUERY SELECT _when, _want, _for, true;
  ELSIF _had_plan IS DISTINCT FROM _want OR _had_term IS DISTINCT FROM _for THEN
    UPDATE public.tesoro_users
       SET pro_requested_plan = _want, pro_requested_term = _for,
           pay_info_sent_at = now()
     WHERE auth_uid = _uid;
    RETURN QUERY SELECT _when, _want, _for, true;
  ELSE
    -- Asking again for the same thing re-sends the details and nothing else.
    UPDATE public.tesoro_users SET pay_info_sent_at = now() WHERE auth_uid = _uid;
    RETURN QUERY SELECT _when, _had_plan, _had_term, false;
  END IF;
END;
$function$;

/*
   Throwing away a receipt once it has been looked at.

   An admin checks the picture, grants the plan, and the picture has done its
   job -- it is a screenshot of somebody's bank app, and keeping it after it
   has been read is keeping it for no reason. Clearing is a separate act from
   granting on purpose: a receipt that does not match should be removed and
   the plan not granted.
*/
CREATE OR REPLACE FUNCTION public.tesoro_clear_receipt(_sno bigint)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE _url text;
BEGIN
  IF NOT public.is_tesoro_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admins only.' USING errcode = '42501';
  END IF;

  SELECT t.pay_receipt_url INTO _url FROM public.tesoro_users t WHERE t.sno = _sno;

  UPDATE public.tesoro_users
     SET pay_receipt_url = NULL, pay_receipt_at = NULL
   WHERE sno = _sno;

  -- Handed back so the caller can delete the stored file as well: the row is
  -- the reference, the object is the picture, and forgetting the second is
  -- how a bucket fills up with other people's bank screenshots.
  RETURN _url;
END;
$function$;

REVOKE ALL ON FUNCTION public.tesoro_clear_receipt(bigint) FROM public;
REVOKE ALL ON FUNCTION public.tesoro_clear_receipt(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.tesoro_clear_receipt(bigint) TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.tesoro_clear_receipt(bigint)', 'execute') THEN
    RAISE EXCEPTION 'CHECK: anon should not be able to delete a receipt';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.tesoro_clear_receipt(bigint)', 'execute') THEN
    RAISE EXCEPTION 'CHECK: a signed-in admin should be able to delete a receipt';
  END IF;

  RAISE NOTICE 'All checks passed.';
END $$;
