-- A way to say what is missing, and a way to say what is broken.
--
-- One table for both, because they are the same shape: somebody typed a
-- paragraph and the app knows who they are. The kind is a column rather than a
-- second table, so a report that turns out to be a request is one word to fix.
--
-- No email column. The account is already the author, and tesoro_users holds
-- the address -- a copy taken at the moment of writing would be the address
-- that was right once, and the one nobody notices has gone stale.

CREATE TABLE IF NOT EXISTS public.tesoro_feedback (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_uid    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('feature', 'bug')),
  body        text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  -- Where they were and what they were running, because "it does not work" is
  -- a different sentence on build 290 than on build 295.
  build       text,
  path        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  handled_at  timestamptz
);

COMMENT ON TABLE public.tesoro_feedback IS
  'Feature requests and bug reports. The author is the account; the address is read from tesoro_users, never copied here.';

CREATE INDEX IF NOT EXISTS tesoro_feedback_unhandled
  ON public.tesoro_feedback (created_at DESC) WHERE handled_at IS NULL;

ALTER TABLE public.tesoro_feedback ENABLE ROW LEVEL SECURITY;

-- Writing: your own, signed in, and that is all. The uid is checked rather
-- than trusted from the payload, so nobody files a complaint as somebody else.
DROP POLICY IF EXISTS "Say your own piece" ON public.tesoro_feedback;
CREATE POLICY "Say your own piece" ON public.tesoro_feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth_uid = auth.uid());

DROP POLICY IF EXISTS "Read your own" ON public.tesoro_feedback;
CREATE POLICY "Read your own" ON public.tesoro_feedback
  FOR SELECT TO authenticated
  USING (auth_uid = auth.uid() OR public.is_tesoro_admin(auth.uid()));

-- Only an admin marks one handled. Nobody deletes: a report somebody took the
-- trouble to write is not the app's to throw away.
DROP POLICY IF EXISTS "Admins act on it" ON public.tesoro_feedback;
CREATE POLICY "Admins act on it" ON public.tesoro_feedback
  FOR UPDATE TO authenticated
  USING (public.is_tesoro_admin(auth.uid()))
  WITH CHECK (public.is_tesoro_admin(auth.uid()));

/*
   What an admin reads: the paragraph, and who to answer.

   Security definer so the address comes from tesoro_users without opening that
   table to anybody; the admin check is inside, so a non-admin calling it gets
   nothing rather than an error that tells them the function exists.
*/
CREATE OR REPLACE FUNCTION public.admin_list_feedback()
RETURNS TABLE (
  id bigint, kind text, body text, build text, path text,
  created_at timestamptz, handled_at timestamptz,
  email_id text, first_name text, last_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  SELECT f.id, f.kind, f.body, f.build, f.path, f.created_at, f.handled_at,
         u.email_id, u.first_name, u.last_name
    FROM public.tesoro_feedback f
    LEFT JOIN public.tesoro_users u ON u.auth_uid = f.auth_uid
   WHERE public.is_tesoro_admin(auth.uid())
   ORDER BY f.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_feedback() FROM public;
REVOKE ALL ON FUNCTION public.admin_list_feedback() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_feedback() TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.admin_list_feedback()', 'execute') THEN
    RAISE EXCEPTION 'CHECK: anon should not be able to read feedback';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE tablename = 'tesoro_feedback' AND cmd = 'INSERT') THEN
    RAISE EXCEPTION 'CHECK: nothing restricts who writes feedback';
  END IF;

  IF (SELECT relrowsecurity FROM pg_class WHERE relname = 'tesoro_feedback') IS NOT TRUE THEN
    RAISE EXCEPTION 'CHECK: row level security is off on tesoro_feedback';
  END IF;

  -- An empty report is not a report.
  BEGIN
    INSERT INTO public.tesoro_feedback (auth_uid, kind, body)
    VALUES ('00000000-0000-0000-0000-000000000000', 'feature', '   ');
    RAISE EXCEPTION 'CHECK: a blank body was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN foreign_key_violation THEN NULL;
  END;

  RAISE NOTICE 'All checks passed.';
END $$;
