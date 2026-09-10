-- ---------------------------------------------------------------------------
-- Theme follows the account, not the browser.
--
-- Accent colour already lived here; the light/dark choice did not, so a person
-- who picked light on their laptop still got dark on their phone. It joins the
-- same row, and gains a third value: "system", which defers to whatever the
-- operating system is currently asking for.
--
-- The column is nullable on purpose. NULL means "nobody has chosen on any
-- device yet", which lets the client keep the preference already stored in that
-- browser instead of having a server-side default quietly overwrite it the
-- first time this migration lands.
-- ---------------------------------------------------------------------------

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS theme text;

ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_theme_check;

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_theme_check
  CHECK (theme IS NULL OR theme IN ('light', 'dark', 'system'));
