-- ---------------------------------------------------------------------------
-- What a user ID is allowed to be.
--
-- Six letters and two numbers, at least, in any order. The old rule was three
-- to twenty of anything, which allowed `sam` -- one letter away from `sms`,
-- `san` and a dozen other people's handles -- and allowed a handle made
-- entirely of letters, which reads as a real name to whoever is being
-- impersonated with it.
--
-- The mirror of src/lib/handle.ts, and the two are checked against the same
-- examples. Where they ever disagree, this one wins: it is the one a request
-- cannot route around.
--
-- Existing handles do not meet it, and that is the decision taken: they stop
-- working. Signing in by handle is refused for a handle that no longer
-- qualifies, signing in by email still works, and tesoro_set_handle below is
-- how somebody in that position fixes it themselves -- which until now they
-- could not do at all, because the profile policy pins user_id and renames
-- went through an admin.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_valid_tesoro_handle(_handle text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.normalize_tesoro_handle(_handle) ~ '^[a-z0-9_]{1,20}$'
     AND length(regexp_replace(public.normalize_tesoro_handle(_handle), '[^a-z]', '', 'g')) >= 6
     AND length(regexp_replace(public.normalize_tesoro_handle(_handle), '[^0-9]', '', 'g')) >= 2;
$$;

-- ---------------------------------------------------------------------------
-- Signup has to produce one of these without asking.
--
-- It runs inside a trigger that must not fail, so it never rejects: letters
-- are padded from whatever came in and two digits go on the end, which is
-- suggestHandle() in the TypeScript, and then the existing counter settles a
-- collision.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.unique_tesoro_handle(
  _desired text, _exclude_sno bigint DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw       text := regexp_replace(public.normalize_tesoro_handle(_desired), '[^a-z0-9_]', '', 'g');
  letters   text := regexp_replace(raw, '[^a-z]', '', 'g');
  digits    text := regexp_replace(raw, '[^0-9]', '', 'g');
  base      text;
  candidate text;
  n         integer := 1;
BEGIN
  IF letters = '' THEN letters := 'viiver'; END IF;
  WHILE length(letters) < 6 LOOP letters := letters || letters; END LOOP;
  letters := left(letters, 18);
  base := left(letters || left(digits || '00', 2), 20);

  candidate := base;
  WHILE EXISTS (
    SELECT 1 FROM public.tesoro_users
    WHERE lower(user_id) = candidate
      AND (_exclude_sno IS NULL OR sno <> _exclude_sno)
  ) LOOP
    n := n + 1;
    -- The counter is digits, so the handle it produces still qualifies.
    candidate := left(letters, 20 - length(n::text) - 2) || '0' || n::text || '0';
    IF NOT public.is_valid_tesoro_handle(candidate) THEN
      candidate := left(letters, 12) || to_char(n, 'FM0000000');
    END IF;
  END LOOP;

  RETURN candidate;
END;
$$;

-- ---------------------------------------------------------------------------
-- Signing in by handle, for handles that still are one.
--
-- An old handle resolving here would be a handle that works for sign-in and
-- is refused everywhere else, which is the confusing half of both worlds.
-- Email sign-in is untouched, and it is the way back in.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.email_for_login(_identifier text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email_id FROM public.tesoro_users
  WHERE lower(user_id) = lower(TRIM(_identifier))
    AND public.is_valid_tesoro_handle(user_id)
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- Changing your own, once.
--
-- The profile policy pins user_id, so this is security definer or it is an
-- admin's job. It is deliberately narrow: it only lets go of a handle that
-- does not meet the rule. Somebody on a valid handle still cannot rename
-- themselves, because a handle people recognise each other by is not a thing
-- to swap around, and nothing here is worth opening that up for.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tesoro_set_handle(_handle text)
RETURNS TABLE (handle text, changed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid  uuid := auth.uid();
  _now  text;
  _want text := public.normalize_tesoro_handle(_handle);
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING errcode = '28000';
  END IF;

  SELECT user_id INTO _now FROM public.tesoro_users WHERE auth_uid = _uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No account for this sign-in.' USING errcode = 'P0002';
  END IF;

  IF public.is_valid_tesoro_handle(_now) THEN
    RAISE EXCEPTION 'Your user ID already meets the rules. Ask an admin to change it.'
      USING errcode = '42501';
  END IF;

  IF NOT public.is_valid_tesoro_handle(_want) THEN
    RAISE EXCEPTION 'A user ID needs at least six letters and two numbers.'
      USING errcode = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tesoro_users WHERE lower(user_id) = _want AND auth_uid <> _uid)
  THEN
    RAISE EXCEPTION 'That user ID is taken.' USING errcode = '23505';
  END IF;

  UPDATE public.tesoro_users SET user_id = _want WHERE auth_uid = _uid;
  RETURN QUERY SELECT _want, true;
END;
$function$;

REVOKE ALL ON FUNCTION public.tesoro_set_handle(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tesoro_set_handle(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Checks
--
-- The same examples handle.selfcheck.ts runs, so the two rules cannot drift
-- apart without one of them failing.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT (public.is_valid_tesoro_handle('mervink99')
      AND public.is_valid_tesoro_handle('42sanjaybirdar')
      AND public.is_valid_tesoro_handle('hot_wheels07')
      AND public.is_valid_tesoro_handle('MervinK99')
      AND public.is_valid_tesoro_handle('abcdef12')) THEN
    RAISE EXCEPTION 'CHECK: a handle that should be allowed is not';
  END IF;

  IF public.is_valid_tesoro_handle('mervin')
     OR public.is_valid_tesoro_handle('mervin1')
     OR public.is_valid_tesoro_handle('abcde12')
     OR public.is_valid_tesoro_handle('car99')
     OR public.is_valid_tesoro_handle('123456789012')
     OR public.is_valid_tesoro_handle('mervin-k99')
     OR public.is_valid_tesoro_handle('mervinkalaimani99999999')
     OR public.is_valid_tesoro_handle('') THEN
    RAISE EXCEPTION 'CHECK: a handle that should be refused is allowed';
  END IF;

  -- Whatever goes in, what comes out is usable as a handle.
  IF NOT (public.is_valid_tesoro_handle(public.unique_tesoro_handle('mervin'))
      AND public.is_valid_tesoro_handle(public.unique_tesoro_handle('sam'))
      AND public.is_valid_tesoro_handle(public.unique_tesoro_handle('99'))
      AND public.is_valid_tesoro_handle(public.unique_tesoro_handle(''))) THEN
    RAISE EXCEPTION 'CHECK: signup can generate a handle its own rule refuses';
  END IF;

  -- An old handle no longer signs anybody in.
  IF EXISTS (SELECT 1 FROM public.tesoro_users WHERE user_id = 'mervin')
     AND public.email_for_login('mervin') IS NOT NULL THEN
    RAISE EXCEPTION 'CHECK: a handle that fails the rule still resolves to an email';
  END IF;

  IF has_function_privilege('anon', 'public.tesoro_set_handle(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CHECK: a signed-out caller can rename an account';
  END IF;
END $$;
