-- Who may say what a shop is called, and where it is.
--
-- The seller row was written by admins only, which made every correction a
-- message to an admin: the person who actually bought from the shop knows its
-- name, its number and its town, and had no way to record any of it.
--
-- Pro writes it now. Reading is unchanged -- any signed-in account -- and the
-- cars themselves are still never rewritten from here.
--
-- Worth saying plainly: this table is shared. There is one row per seller name
-- for the whole application, not one per account, so a Pro account editing
-- "Amazon" edits the Amazon every other account sees. That is the same table
-- it always was; what changes is how many people may write to it. If that
-- turns out to be too many hands, the fix is a row per account rather than a
-- narrower policy, and that is a different migration.

DROP POLICY IF EXISTS "seller details are written by admins" ON public.tesoro_sellers;
DROP POLICY IF EXISTS "seller details are written by pro" ON public.tesoro_sellers;

CREATE POLICY "seller details are written by pro"
  ON public.tesoro_sellers FOR ALL TO authenticated
  USING (public.is_tesoro_pro(auth.uid()))
  WITH CHECK (public.is_tesoro_pro(auth.uid()));

DO $$
DECLARE
  _n int;
BEGIN
  -- Reading stays open to every signed-in account, and writing is one policy,
  -- not two: a leftover admin policy would be a second door into the same room.
  SELECT count(*) INTO _n
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'tesoro_sellers' AND cmd = 'ALL';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'CHECK: expected exactly one write policy on tesoro_sellers, found %', _n;
  END IF;

  SELECT count(*) INTO _n
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'tesoro_sellers'
     AND policyname = 'seller details are readable by members';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'CHECK: the read policy should still be there';
  END IF;

  -- The write policy names the tier function rather than the admin one.
  SELECT count(*) INTO _n
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'tesoro_sellers'
     AND cmd = 'ALL' AND qual LIKE '%is_tesoro_pro%';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'CHECK: the write policy should be gated on is_tesoro_pro';
  END IF;

  RAISE NOTICE 'All checks passed.';
END $$;
