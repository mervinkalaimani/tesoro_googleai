-- ---------------------------------------------------------------------------
-- A trial must not block buying the thing it is a trial of.
--
-- tesoro_request_pro refused anybody is_tesoro_pro() called Pro, and a running
-- trial is one of the three ways that function says yes. So the fortnight that
-- exists to turn somebody into a subscriber was the fortnight in which they
-- could not become one: pressing Choose Plus or Choose Pro answered "this
-- account is already on Pro" and recorded nothing.
--
-- The gate is now what it always meant: already paying. Owner, or a paid plan
-- that has not run out -- the same first two branches tesoro_plan() uses, and
-- deliberately not its third.
--
-- Everything else about the function is unchanged from
-- 20261026090000_the_qr_goes_out_with_the_ask.sql.
-- ---------------------------------------------------------------------------

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
  _paying boolean;
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

  SELECT true, t.pro_requested_at, t.pro_requested_plan, t.pro_requested_term,
         t.is_owner OR (t.is_pro AND t.pro_plan IS NOT NULL
                        AND (t.pro_since IS NULL OR t.pro_until >= current_date))
    INTO _exists, _when, _had_plan, _had_term, _paying
    FROM public.tesoro_users t WHERE t.auth_uid = _uid;
  IF NOT coalesce(_exists, false) THEN
    RAISE EXCEPTION 'No account for this sign-in.' USING errcode = 'P0002';
  END IF;

  -- Already paying for one. A trial is not that: somebody halfway through a
  -- fortnight is exactly who this screen is for.
  IF coalesce(_paying, false) THEN
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

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  src text := pg_get_functiondef('public.tesoro_request_pro(text, text)'::regprocedure);
BEGIN
  IF src LIKE '%is_tesoro_pro%' THEN
    RAISE EXCEPTION 'CHECK: the trial still blocks the ask';
  END IF;

  IF src NOT LIKE '%pro_plan IS NOT NULL%' THEN
    RAISE EXCEPTION 'CHECK: the gate no longer reads a paid plan';
  END IF;

  -- The ask is still the account''s own to make, and nobody else''s.
  IF has_function_privilege('anon', 'public.tesoro_request_pro(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CHECK: a signed-out caller can raise a request';
  END IF;
END $$;
