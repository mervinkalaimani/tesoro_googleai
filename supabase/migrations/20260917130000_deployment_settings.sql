-- Settings that belong to the deployment rather than to a person.
--
-- Note the name. `app_settings` is already taken by the per-account preference
-- row — theme, accent colour, keyed by user_id — which is the opposite of what
-- this is for. These are facts about the install: the same for everyone, and
-- readable by someone who is not signed in, because the login screen is exactly
-- where the first of them is needed.
--
-- Hence an unusual RLS shape: world-readable, owner-writable. Nothing secret
-- goes in here. It answers "what does this install have turned on", and that
-- answer is public by nature — anyone can see which buttons the login page
-- renders.

CREATE TABLE IF NOT EXISTS public.deployment_settings (
  key        text PRIMARY KEY,
  value      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.deployment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads deployment settings" ON public.deployment_settings;
CREATE POLICY "Anyone reads deployment settings" ON public.deployment_settings
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Owner writes deployment settings" ON public.deployment_settings;
CREATE POLICY "Owner writes deployment settings" ON public.deployment_settings
  FOR ALL
  USING (public.is_tesoro_owner(auth.uid()))
  WITH CHECK (public.is_tesoro_owner(auth.uid()));

GRANT SELECT ON public.deployment_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.deployment_settings TO authenticated;

-- Both off to begin with. A provider button that is visible but not configured
-- in Supabase does not fail politely — it hands whoever presses it a Supabase
-- error page and no way back — so the honest default is to show neither until
-- someone has confirmed they work.
INSERT INTO public.deployment_settings (key, value)
VALUES ('oauth_providers', '{"google": false, "apple": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
