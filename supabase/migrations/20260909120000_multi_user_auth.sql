-- Multi-user auth, per-user collections, and admin access control.
--
-- Credentials live in auth.users (Supabase Auth, bcrypt, never client-readable).
-- public.tesoro_users is the profile + role table:
--   user_id  - the human login handle, auto-generated (see build_tesoro_user_id)
--   auth_uid - the link to the Supabase Auth account, used by every RLS policy
--
-- Access model: anyone may sign up, but a new account is not approved and sees
-- nothing until an admin approves it. If no admin exists yet, the first account
-- is bootstrapped as an approved admin and claims the pre-existing collection.

-- ---------------------------------------------------------------------------
-- 1. tesoro_users: drop credentials, add the columns the access model needs
-- ---------------------------------------------------------------------------

-- Passwords are Supabase Auth's job. Keeping a readable password column next to
-- a public API key is the one thing this migration most needs to undo.
ALTER TABLE public.tesoro_users DROP COLUMN IF EXISTS password;

ALTER TABLE public.tesoro_users
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;

-- The owner account is exempt from approval and cannot be suspended, demoted
-- or deleted by anyone, including other admins.
ALTER TABLE public.tesoro_users
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

-- The auth link gets its own column so user_id stays free to be the handle.
ALTER TABLE public.tesoro_users
  ADD COLUMN IF NOT EXISTS auth_uid uuid REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.tesoro_users ALTER COLUMN user_id DROP NOT NULL;

-- dob cannot be derived if a signup ever arrives without it; an honest NULL
-- beats a fabricated date. The signup form requires it.
ALTER TABLE public.tesoro_users ALTER COLUMN dob DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tesoro_users_auth_uid_key
  ON public.tesoro_users (auth_uid) WHERE auth_uid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tesoro_users_user_id_key
  ON public.tesoro_users (lower(user_id)) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tesoro_users_email_key
  ON public.tesoro_users (lower(email_id));
CREATE INDEX IF NOT EXISTS tesoro_users_is_admin_idx
  ON public.tesoro_users (is_admin) WHERE is_admin;

-- There can only ever be one owner.
CREATE UNIQUE INDEX IF NOT EXISTS tesoro_users_single_owner_idx
  ON public.tesoro_users ((is_owner)) WHERE is_owner;

ALTER TABLE public.tesoro_users ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Login handle generation
--
-- First 5 letters of the first name + first letter of the last name + DDMM of
-- the date of birth, e.g. Mervin Kalaimani born 17 March -> "mervik1703".
-- Non-letters are stripped so spaces and hyphens can't produce odd handles.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.build_tesoro_user_id(_first text, _last text, _dob date)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    left(regexp_replace(COALESCE(_first, ''), '[^a-zA-Z]', '', 'g'), 5)
    || left(regexp_replace(COALESCE(_last, ''), '[^a-zA-Z]', '', 'g'), 1)
    || COALESCE(to_char(_dob, 'DDMM'), '')
  );
$$;

-- Same name and same birthday collide, so the handle gets a numeric suffix
-- rather than failing the signup outright.
CREATE OR REPLACE FUNCTION public.unique_tesoro_user_id(
  _first text, _last text, _dob date, _exclude_sno bigint DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base      text := public.build_tesoro_user_id(_first, _last, _dob);
  candidate text;
  n         integer := 1;
BEGIN
  IF base IS NULL OR base = '' THEN
    base := 'user';
  END IF;

  candidate := base;
  WHILE EXISTS (
    SELECT 1 FROM public.tesoro_users
    WHERE lower(user_id) = candidate
      AND (_exclude_sno IS NULL OR sno <> _exclude_sno)
  ) LOOP
    n := n + 1;
    candidate := base || n::text;
  END LOOP;

  RETURN candidate;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Sign-in by handle
--
-- Supabase Auth only authenticates by email, so a handle has to be resolved to
-- one before signInWithPassword. Exposed to anon because it necessarily runs
-- before the user is authenticated. It answers a single exact match and never
-- lists, but it does mean a known handle reveals its email address -- an
-- accepted trade for handle login.
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
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.email_for_login(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Security-definer helpers
--
-- These bypass RLS deliberately. A policy on tesoro_users that queried
-- tesoro_users directly would recurse infinitely; routing through a
-- SECURITY DEFINER function breaks the cycle. search_path is pinned so the
-- elevated body cannot be hijacked by a caller-controlled search_path.
-- ---------------------------------------------------------------------------

-- The owner is always an admin and always approved, whatever the flags say.
CREATE OR REPLACE FUNCTION public.is_tesoro_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tesoro_users
    WHERE auth_uid = _uid AND (is_admin OR is_owner)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tesoro_approved(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tesoro_users
    WHERE auth_uid = _uid AND (is_approved OR is_owner)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tesoro_owner(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tesoro_users WHERE auth_uid = _uid AND is_owner
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Policies on tesoro_users
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users read own profile" ON public.tesoro_users;
CREATE POLICY "Users read own profile" ON public.tesoro_users
  FOR SELECT USING (auth_uid = auth.uid());

DROP POLICY IF EXISTS "Admins read all profiles" ON public.tesoro_users;
CREATE POLICY "Admins read all profiles" ON public.tesoro_users
  FOR SELECT USING (public.is_tesoro_admin(auth.uid()));

-- is_admin, is_approved and user_id sit on the row the user can edit, so the
-- WITH CHECK pins them to their current values: without this, any user could
-- grant themselves admin with a single PATCH.
DROP POLICY IF EXISTS "Users update own profile" ON public.tesoro_users;
CREATE POLICY "Users update own profile" ON public.tesoro_users
  FOR UPDATE USING (auth_uid = auth.uid())
  WITH CHECK (
    auth_uid = auth.uid()
    AND is_admin = (SELECT t.is_admin FROM public.tesoro_users t WHERE t.auth_uid = auth.uid())
    AND is_approved = (SELECT t.is_approved FROM public.tesoro_users t WHERE t.auth_uid = auth.uid())
    AND user_id IS NOT DISTINCT FROM
        (SELECT t.user_id FROM public.tesoro_users t WHERE t.auth_uid = auth.uid())
  );

-- Admins may manage everyone except the owner, whose row only the owner can
-- touch.
DROP POLICY IF EXISTS "Admins update any profile" ON public.tesoro_users;
CREATE POLICY "Admins update any profile" ON public.tesoro_users
  FOR UPDATE USING (
    public.is_tesoro_admin(auth.uid())
    AND (NOT is_owner OR auth_uid = auth.uid())
  )
  WITH CHECK (public.is_tesoro_admin(auth.uid()));

-- An admin cannot delete themselves, so the last admin can't lock everyone out
-- by accident, and nobody can delete the owner.
DROP POLICY IF EXISTS "Admins delete profiles" ON public.tesoro_users;
CREATE POLICY "Admins delete profiles" ON public.tesoro_users
  FOR DELETE USING (
    public.is_tesoro_admin(auth.uid())
    AND auth_uid IS DISTINCT FROM auth.uid()
    AND NOT is_owner
  );

-- Belt and braces over the policies above: is_owner is never settable through
-- the API, and the owner can never end up suspended or demoted. Policy
-- WITH CHECK clauses can't compare against the pre-update row, so this runs as
-- a trigger instead.
CREATE OR REPLACE FUNCTION public.protect_tesoro_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.is_owner := OLD.is_owner;

  IF OLD.is_owner THEN
    NEW.is_admin    := true;
    NEW.is_approved := true;
    NEW.auth_uid    := COALESCE(NEW.auth_uid, OLD.auth_uid);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tesoro_users_protect_owner ON public.tesoro_users;
CREATE TRIGGER tesoro_users_protect_owner
  BEFORE UPDATE ON public.tesoro_users
  FOR EACH ROW EXECUTE FUNCTION public.protect_tesoro_owner();

-- Rows are created by the signup trigger (SECURITY DEFINER, bypasses RLS).
-- No INSERT policy exists, so clients cannot invent profiles.
REVOKE ALL ON public.tesoro_users FROM anon;
GRANT SELECT, UPDATE, DELETE ON public.tesoro_users TO authenticated;

-- Superseded by tesoro_users; drop them if an earlier draft created them.
DROP TABLE IF EXISTS public.user_roles;
DROP TABLE IF EXISTS public.profiles;

-- ---------------------------------------------------------------------------
-- 6. Per-user ownership of tesoro_raw
-- ---------------------------------------------------------------------------

-- Policies are dropped before the column is touched: Postgres refuses to
-- change the type of a column that any policy definition references, so a
-- re-run over a partly-applied database would fail here otherwise.
DROP POLICY IF EXISTS "Anyone can read cars" ON public.tesoro_raw;
DROP POLICY IF EXISTS "Anyone can insert cars" ON public.tesoro_raw;
DROP POLICY IF EXISTS "Anyone can update cars" ON public.tesoro_raw;
DROP POLICY IF EXISTS "Anyone can delete cars" ON public.tesoro_raw;
DROP POLICY IF EXISTS "Owners read own cars" ON public.tesoro_raw;
DROP POLICY IF EXISTS "Owners insert own cars" ON public.tesoro_raw;
DROP POLICY IF EXISTS "Owners update own cars" ON public.tesoro_raw;
DROP POLICY IF EXISTS "Owners delete own cars" ON public.tesoro_raw;

ALTER TABLE public.tesoro_raw
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- If the column already existed as text, ADD COLUMN IF NOT EXISTS above was a
-- no-op and every policy comparing it to auth.uid() would fail with
-- "operator does not exist: uuid = text". Convert it. Anything that isn't a
-- well-formed UUID becomes NULL rather than aborting the migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tesoro_raw'
      AND column_name = 'user_id' AND data_type <> 'uuid'
  ) THEN
    EXECUTE $conv$
      ALTER TABLE public.tesoro_raw
      ALTER COLUMN user_id TYPE uuid
      USING (
        CASE WHEN user_id::text ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN user_id::text::uuid ELSE NULL END
      )
    $conv$;
  END IF;
END $$;

-- Added separately: ADD COLUMN IF NOT EXISTS skips the REFERENCES clause when
-- the column was already present.
ALTER TABLE public.tesoro_raw DROP CONSTRAINT IF EXISTS tesoro_raw_user_id_fkey;
ALTER TABLE public.tesoro_raw
  ADD CONSTRAINT tesoro_raw_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS tesoro_raw_user_id_idx ON public.tesoro_raw (user_id);

-- "Car ID" is only unique within one person's collection now, so the upsert
-- target has to include the owner.
DROP INDEX IF EXISTS public.tesoro_raw_car_id_key;
ALTER TABLE public.tesoro_raw DROP CONSTRAINT IF EXISTS tesoro_raw_car_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS tesoro_raw_user_car_id_key
  ON public.tesoro_raw (user_id, "Car ID");

ALTER TABLE public.tesoro_raw ENABLE ROW LEVEL SECURITY;

-- Approval is enforced here, not just in the UI: a suspended account still
-- holds a valid JWT and could call PostgREST directly.
CREATE POLICY "Owners read own cars" ON public.tesoro_raw
  FOR SELECT USING (auth.uid() = user_id AND public.is_tesoro_approved(auth.uid()));

CREATE POLICY "Owners insert own cars" ON public.tesoro_raw
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_tesoro_approved(auth.uid()));

CREATE POLICY "Owners update own cars" ON public.tesoro_raw
  FOR UPDATE USING (auth.uid() = user_id AND public.is_tesoro_approved(auth.uid()))
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners delete own cars" ON public.tesoro_raw
  FOR DELETE USING (auth.uid() = user_id AND public.is_tesoro_approved(auth.uid()));

REVOKE ALL ON public.tesoro_raw FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tesoro_raw TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Per-user app settings
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.app_settings;
CREATE TABLE public.app_settings (
  user_id       uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  accent_color  text NOT NULL DEFAULT 'crimson',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage own settings" ON public.app_settings;
CREATE POLICY "Owners manage own settings" ON public.app_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.app_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Reserve the owner's account
--
-- No password here: Supabase Auth owns credentials. Signing up through the app
-- with this email adopts this row, so the account arrives as the owner —
-- admin, and exempt from approval.
--
-- The protect trigger pins is_owner against every UPDATE, so it is switched off
-- for the one statement that legitimately sets it.
-- ---------------------------------------------------------------------------

ALTER TABLE public.tesoro_users DISABLE TRIGGER tesoro_users_protect_owner;

-- Exactly one owner: clear any other row first so the unique index can't trip.
UPDATE public.tesoro_users
SET is_owner = false
WHERE is_owner AND lower(email_id) <> 'mervinkalaimani@gmail.com';

INSERT INTO public.tesoro_users (first_name, last_name, email_id, is_admin, is_approved, is_owner)
VALUES ('Mervin', 'Kalaimani', 'mervinkalaimani@gmail.com', true, true, true)
ON CONFLICT (lower(email_id)) DO UPDATE
  SET is_admin = true, is_approved = true, is_owner = true;

ALTER TABLE public.tesoro_users ENABLE TRIGGER tesoro_users_protect_owner;

-- ---------------------------------------------------------------------------
-- 9. Signup trigger
--
-- Links to a profile row that already exists for that email (so a row added by
-- hand keeps its name, dob and is_admin flag) instead of duplicating the person.
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
  meta_first   text := NULLIF(TRIM(NEW.raw_user_meta_data ->> 'first_name'), '');
  meta_last    text := NULLIF(TRIM(NEW.raw_user_meta_data ->> 'last_name'), '');
  meta_dob     date;
  row_first    text;
  row_last     text;
  row_dob      date;
BEGIN
  BEGIN
    meta_dob := NULLIF(NEW.raw_user_meta_data ->> 'dob', '')::date;
  EXCEPTION WHEN others THEN
    meta_dob := NULL;  -- Never fail a signup over an unparseable date.
  END;

  -- Reserved rows count even before anyone signs into them: once an owner or
  -- admin is designated, a stranger's signup must not be bootstrapped as admin.
  SELECT EXISTS (SELECT 1 FROM public.tesoro_users WHERE is_admin OR is_owner)
  INTO admin_exists;

  -- Adopt a hand-created row for this email, if there is one.
  UPDATE public.tesoro_users
  SET auth_uid   = NEW.id,
      first_name = COALESCE(NULLIF(TRIM(first_name), ''), meta_first, split_part(NEW.email, '@', 1)),
      last_name  = COALESCE(NULLIF(TRIM(last_name), ''), meta_last, ''),
      dob        = COALESCE(dob, meta_dob)
  WHERE lower(email_id) = lower(NEW.email)
  RETURNING sno INTO target_sno;

  IF target_sno IS NULL THEN
    INSERT INTO public.tesoro_users (
      auth_uid, first_name, last_name, dob, email_id, is_admin, is_approved
    )
    VALUES (
      NEW.id,
      COALESCE(meta_first, split_part(NEW.email, '@', 1)),
      COALESCE(meta_last, ''),
      meta_dob,
      NEW.email,
      NOT admin_exists,
      NOT admin_exists
    )
    RETURNING sno INTO target_sno;
  END IF;

  -- Generate the login handle now that name and dob are settled.
  SELECT first_name, last_name, dob INTO row_first, row_last, row_dob
  FROM public.tesoro_users WHERE sno = target_sno;

  UPDATE public.tesoro_users
  SET user_id = public.unique_tesoro_user_id(row_first, row_last, row_dob, target_sno)
  WHERE sno = target_sno AND (user_id IS NULL OR TRIM(user_id) = '');

  -- Whoever ends up admin must be able to get in.
  UPDATE public.tesoro_users
  SET is_approved = true
  WHERE sno = target_sno AND (is_admin OR is_owner);

  -- The owner (or first admin) inherits the collection that predates this
  -- migration.
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
-- 10. Backfill accounts that already exist in auth.users
--
-- The trigger only fires on INSERT, so anyone who signed up before this
-- migration would otherwise be left without a profile and locked out.
-- ---------------------------------------------------------------------------

UPDATE public.tesoro_users t
SET auth_uid = u.id
FROM auth.users u
WHERE lower(t.email_id) = lower(u.email) AND t.auth_uid IS DISTINCT FROM u.id;

INSERT INTO public.tesoro_users (auth_uid, first_name, last_name, email_id, is_admin, is_approved)
SELECT u.id, split_part(u.email, '@', 1), '', u.email, false, false
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.tesoro_users t WHERE lower(t.email_id) = lower(u.email)
);

-- Give every row a handle, including the reserved admin row above.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT sno, first_name, last_name, dob FROM public.tesoro_users
    WHERE user_id IS NULL OR TRIM(user_id) = '' ORDER BY sno
  LOOP
    UPDATE public.tesoro_users
    SET user_id = public.unique_tesoro_user_id(r.first_name, r.last_name, r.dob, r.sno)
    WHERE sno = r.sno;
  END LOOP;
END $$;

INSERT INTO public.app_settings (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- Hand the existing collection to the admin, once one is actually linked.
UPDATE public.tesoro_raw SET user_id = (
  SELECT t.auth_uid FROM public.tesoro_users t
  WHERE t.is_admin AND t.auth_uid IS NOT NULL ORDER BY t.sno LIMIT 1
)
WHERE user_id IS NULL
  AND EXISTS (SELECT 1 FROM public.tesoro_users WHERE is_admin AND auth_uid IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 11. Admin dashboard
--
-- Returns aggregates only: admins were never granted read access to other
-- people's rows, so this exposes counts without exposing collections.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE FUNCTION public.admin_list_users()
RETURNS TABLE (
  sno           bigint,
  user_id       text,
  auth_uid      uuid,
  first_name    text,
  last_name     text,
  email_id      text,
  dob           date,
  is_admin      boolean,
  is_approved   boolean,
  is_owner      boolean,
  created_at    timestamptz,
  car_count     bigint,
  last_sign_in  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.sno, t.user_id, t.auth_uid, t.first_name, t.last_name, t.email_id, t.dob,
    t.is_admin, t.is_approved, t.is_owner, t.created_at,
    (SELECT count(*) FROM public.tesoro_raw c WHERE c.user_id = t.auth_uid) AS car_count,
    u.last_sign_in_at
  FROM public.tesoro_users t
  LEFT JOIN auth.users u ON u.id = t.auth_uid
  WHERE public.is_tesoro_admin(auth.uid())
  ORDER BY t.sno;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
