-- ---------------------------------------------------------------------------
-- User-chosen login handles, and a phone number for OTP sign-in.
--
-- Replaces the derived handle (first 5 letters of the first name + last initial
-- + DDMM of birth, e.g. "mervik1703") with one the person types at signup. The
-- date of birth was only ever collected to feed that formula, so it stops being
-- required here.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Phone number on the profile
-- ---------------------------------------------------------------------------

ALTER TABLE public.tesoro_users
  ADD COLUMN IF NOT EXISTS phone text;

-- One account per number, so an OTP can only ever identify one person.
CREATE UNIQUE INDEX IF NOT EXISTS tesoro_users_phone_key
  ON public.tesoro_users (regexp_replace(phone, '[^0-9]', '', 'g'))
  WHERE phone IS NOT NULL AND TRIM(phone) <> '';

-- ---------------------------------------------------------------------------
-- 2. Handle rules
--
-- Lowercase letters, digits and underscores, 3-20 characters. Normalisation is
-- shared by the availability check, the signup trigger and any later rename, so
-- all three agree on what "taken" means.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_tesoro_handle(_handle text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(TRIM(COALESCE(_handle, '')));
$$;

CREATE OR REPLACE FUNCTION public.is_valid_tesoro_handle(_handle text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.normalize_tesoro_handle(_handle) ~ '^[a-z0-9_]{3,20}$';
$$;

-- The derived-handle functions are what this migration exists to remove.
DROP FUNCTION IF EXISTS public.unique_tesoro_user_id(text, text, date, bigint);
DROP FUNCTION IF EXISTS public.build_tesoro_user_id(text, text, date);

-- A handle taken between the availability check and the signup would otherwise
-- fail the whole signup, so the trigger falls back to a numeric suffix instead
-- of aborting. The client checks first, so this is the rare race, not the norm.
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
  base      text := public.normalize_tesoro_handle(_desired);
  candidate text;
  n         integer := 1;
BEGIN
  -- Strip anything the rules disallow rather than rejecting outright: this runs
  -- inside a signup that must not fail.
  base := regexp_replace(base, '[^a-z0-9_]', '', 'g');

  IF length(base) < 3 THEN
    base := left(base || 'user', 20);
  END IF;
  base := left(base, 20);

  candidate := base;
  WHILE EXISTS (
    SELECT 1 FROM public.tesoro_users
    WHERE lower(user_id) = candidate
      AND (_exclude_sno IS NULL OR sno <> _exclude_sno)
  ) LOOP
    n := n + 1;
    candidate := left(base, 20 - length(n::text)) || n::text;
  END LOOP;

  RETURN candidate;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Availability check for the signup form
--
-- Exposed to anon because it necessarily runs before the account exists. It
-- answers one yes/no about one handle and never lists, but it does confirm
-- whether a given handle is in use -- the same class of exposure that
-- email_for_login already accepts in exchange for handle sign-in.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tesoro_handle_available(_handle text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_valid_tesoro_handle(_handle)
     AND NOT EXISTS (
       SELECT 1 FROM public.tesoro_users
       WHERE lower(user_id) = public.normalize_tesoro_handle(_handle)
     );
$$;

GRANT EXECUTE ON FUNCTION public.tesoro_handle_available(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_tesoro_handle(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_tesoro_handle(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. A user may not rename themselves into someone else's handle
--
-- The existing "Users update own profile" policy pins user_id to its current
-- value, so renames go through an admin. Left as is; this migration only
-- changes where the initial value comes from.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 5. Signup trigger: take the handle and phone the person typed
--
-- Also covers OAuth signups (Google, Apple), which arrive with no handle and a
-- different metadata shape: Google sends given_name/family_name/full_name/name,
-- Apple usually sends only an email. Those accounts fall back to the local part
-- of the email as their handle, which unique_tesoro_handle then sanitises.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_exists boolean;
  target_sno   bigint;
  -- Should always be present; the fallback exists so a provider that withholds
  -- an address cannot turn a signup into a 500.
  user_email   text := COALESCE(NULLIF(TRIM(NEW.email), ''), NEW.id::text || '@unknown.invalid');
  meta_name    text := NULLIF(TRIM(COALESCE(
                  NEW.raw_user_meta_data ->> 'full_name',
                  NEW.raw_user_meta_data ->> 'name', '')), '');
  meta_first   text := COALESCE(
                  NULLIF(TRIM(NEW.raw_user_meta_data ->> 'first_name'), ''),
                  NULLIF(TRIM(NEW.raw_user_meta_data ->> 'given_name'), ''),
                  NULLIF(split_part(COALESCE(meta_name, ''), ' ', 1), ''));
  meta_last    text := COALESCE(
                  NULLIF(TRIM(NEW.raw_user_meta_data ->> 'last_name'), ''),
                  NULLIF(TRIM(NEW.raw_user_meta_data ->> 'family_name'), ''),
                  -- Everything after the first space, or nothing for a one-word name.
                  NULLIF(TRIM(substr(COALESCE(meta_name, ''),
                    length(split_part(COALESCE(meta_name, ''), ' ', 1)) + 2)), ''));
  meta_handle  text := NULLIF(TRIM(NEW.raw_user_meta_data ->> 'user_id'), '');
  meta_phone   text := NULLIF(TRIM(NEW.raw_user_meta_data ->> 'phone'), '');
  phone_digits text := NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data ->> 'phone', ''), '[^0-9]', '', 'g'), '');
  meta_dob     date;
BEGIN
  BEGIN
    meta_dob := NULLIF(NEW.raw_user_meta_data ->> 'dob', '')::date;
  EXCEPTION WHEN others THEN
    meta_dob := NULL;  -- Never fail a signup over an unparseable date.
  END;

  SELECT EXISTS (SELECT 1 FROM public.tesoro_users WHERE is_admin OR is_owner)
  INTO admin_exists;

  -- Supabase normally links a Google/Apple identity onto the existing account
  -- when the email matches and is confirmed, in which case no row is inserted
  -- here at all. If that ever fails to happen, the adoption below would move
  -- auth_uid onto the new account and the original owner would open an empty
  -- collection -- tesoro_raw is keyed by the *old* uid. Refuse loudly instead.
  IF EXISTS (
    SELECT 1 FROM public.tesoro_users
    WHERE lower(email_id) = lower(user_email)
      AND auth_uid IS NOT NULL
      AND auth_uid <> NEW.id
  ) THEN
    RAISE EXCEPTION
      'An account already exists for %. Sign in with your original method instead.', user_email
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Adopt a hand-created row for this email, if there is one.
  UPDATE public.tesoro_users
  SET auth_uid   = NEW.id,
      first_name = COALESCE(NULLIF(TRIM(first_name), ''), meta_first, split_part(user_email, '@', 1)),
      last_name  = COALESCE(NULLIF(TRIM(last_name), ''), meta_last, ''),
      dob        = COALESCE(dob, meta_dob),
      phone      = COALESCE(NULLIF(TRIM(phone), ''), meta_phone)
  WHERE lower(email_id) = lower(user_email)
  RETURNING sno INTO target_sno;

  IF target_sno IS NULL THEN
    INSERT INTO public.tesoro_users (
      auth_uid, first_name, last_name, dob, email_id, phone, is_admin, is_approved
    )
    VALUES (
      NEW.id,
      COALESCE(meta_first, split_part(user_email, '@', 1)),
      COALESCE(meta_last, ''),
      meta_dob,
      user_email,
      meta_phone,
      NOT admin_exists,
      NOT admin_exists
    )
    RETURNING sno INTO target_sno;
  END IF;

  -- The handle the person chose. Falls back to the local part of the email only
  -- when signup came from somewhere that doesn't collect one.
  UPDATE public.tesoro_users
  SET user_id = public.unique_tesoro_handle(
        COALESCE(meta_handle, split_part(user_email, '@', 1)), target_sno
      )
  WHERE sno = target_sno AND (user_id IS NULL OR TRIM(user_id) = '');

  -- Claim the number on the auth account itself, otherwise signInWithOtp would
  -- not find this user and would create a second, empty one alongside it.
  -- phone_confirmed_at is deliberately left NULL: possession is proved by
  -- completing the OTP, not by typing the number into a signup form.
  IF phone_digits IS NOT NULL THEN
    BEGIN
      UPDATE auth.users
      SET phone = phone_digits
      WHERE id = NEW.id AND (phone IS NULL OR phone = '');
    EXCEPTION WHEN unique_violation THEN
      -- Another account already holds this number; OTP sign-in stays with them.
      NULL;
    END;
  END IF;

  UPDATE public.tesoro_users
  SET is_approved = true
  WHERE sno = target_sno AND (is_admin OR is_owner);

  IF EXISTS (
    SELECT 1 FROM public.tesoro_users WHERE sno = target_sno AND (is_admin OR is_owner)
  ) THEN
    UPDATE public.tesoro_raw SET user_id = NEW.id WHERE user_id IS NULL;
  END IF;

  INSERT INTO public.app_settings (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 6. Let a signed-in person set their own phone number
--
-- user_id, is_admin and is_approved stay pinned by the existing policy; phone
-- is not one of those, so the current "Users update own profile" policy already
-- permits this. Nothing to add -- noted so the omission reads as deliberate.
-- ---------------------------------------------------------------------------
