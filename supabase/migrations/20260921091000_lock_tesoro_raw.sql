-- Close tesoro_raw to everyone but each car's owner.
--
-- Eight policies granted SELECT, INSERT, UPDATE and DELETE on every row to every
-- role, anonymous included, with `true` as the condition. Row policies are
-- OR'ed, so these overrode the per-owner ones entirely: anyone holding the
-- site's publishable key — which is public — could read, change or delete any
-- account's collection. The app only ever showed a user their own cars because
-- it filtered by user_id in the query, not because the database enforced it.
--
-- After this, the "Owners … own cars" policies are the only ones left, so a
-- signed-in, approved user reaches their own rows and nothing else. Searching
-- other collections goes through search_catalogue(), which returns catalogue
-- fields only. Server code using the service-role key is not subject to RLS
-- and is unaffected.

DROP POLICY IF EXISTS "Allow public read"   ON public.tesoro_raw;
DROP POLICY IF EXISTS "Allow public insert" ON public.tesoro_raw;
DROP POLICY IF EXISTS "Allow public update" ON public.tesoro_raw;
DROP POLICY IF EXISTS "Allow public delete" ON public.tesoro_raw;
DROP POLICY IF EXISTS "Anon Select Policy"  ON public.tesoro_raw;
DROP POLICY IF EXISTS "Anon Insert Policy"  ON public.tesoro_raw;
DROP POLICY IF EXISTS "Anon Update Policy"  ON public.tesoro_raw;
DROP POLICY IF EXISTS "Anon Delete Policy"  ON public.tesoro_raw;

ALTER TABLE public.tesoro_raw ENABLE ROW LEVEL SECURITY;
