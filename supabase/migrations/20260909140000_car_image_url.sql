-- The add/edit car form has always had an "Image URL" field, but tesoro_raw had
-- no column to put it in. saveCarToSupabase catches the resulting schema error
-- and retries without the field, so the link was accepted by the UI and then
-- silently dropped on every save. Give it somewhere to live.

ALTER TABLE public.tesoro_raw
  ADD COLUMN IF NOT EXISTS "Image URL" text;
