-- Remove "Open" column from tesoro_raw as requested.
ALTER TABLE public.tesoro_raw
  DROP COLUMN IF EXISTS "Open";
