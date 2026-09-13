-- Rarity, condition and rating for each car.
--
-- Additive and nullable: nothing existing is rewritten. "Rarity" is read as
-- Chase wherever it is blank and the old "Chase" flag is set, so there is no
-- backfill to run — the app derives it, and writes the column the next time a
-- car is saved.

ALTER TABLE public.tesoro_raw ADD COLUMN IF NOT EXISTS "Rarity" text;
ALTER TABLE public.tesoro_raw ADD COLUMN IF NOT EXISTS "Car Condition" text;
ALTER TABLE public.tesoro_raw ADD COLUMN IF NOT EXISTS "Card Condition" text;
ALTER TABLE public.tesoro_raw ADD COLUMN IF NOT EXISTS "Car Rating" smallint;
ALTER TABLE public.tesoro_raw ADD COLUMN IF NOT EXISTS "Card Rating" smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tesoro_raw_car_rating_range'
  ) THEN
    ALTER TABLE public.tesoro_raw
      ADD CONSTRAINT tesoro_raw_car_rating_range CHECK ("Car Rating" IS NULL OR "Car Rating" BETWEEN 0 AND 5);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tesoro_raw_card_rating_range'
  ) THEN
    ALTER TABLE public.tesoro_raw
      ADD CONSTRAINT tesoro_raw_card_rating_range CHECK ("Card Rating" IS NULL OR "Card Rating" BETWEEN 0 AND 5);
  END IF;
END $$;
