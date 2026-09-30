-- ---------------------------------------------------------------------------
-- A fourth appearance: OLED.
--
-- It is dark with the background turned all the way off. On a screen that
-- lights every pixel by itself a black one costs nothing, so the saving is in
-- the background — which is most of the screen — while the text and the accent
-- stay exactly the colours they already were.
--
-- Nothing else about the column changes: it is still nullable, still text, and
-- still the account's choice rather than the browser's. The check simply has
-- one more value to allow, because a preference the client can store and the
-- database refuses is a preference that silently stops following you between
-- devices.
-- ---------------------------------------------------------------------------

ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_theme_check;

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_theme_check
  CHECK (theme IS NULL OR theme IN ('light', 'dark', 'oled', 'system'));
