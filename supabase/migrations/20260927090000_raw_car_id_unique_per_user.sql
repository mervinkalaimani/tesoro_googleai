-- A catalogue casting keeps one Car ID for everyone who owns it; that shared ID
-- is how an admin's catalogue edit reaches every collection. The Car ID-only
-- unique constraint dates from the single-collection sheet import and stopped a
-- second collector adding a casting someone else already had.
-- tesoro_raw_user_car_id_key (user_id, "Car ID") still prevents duplicates
-- within one collection.
ALTER TABLE public.tesoro_raw DROP CONSTRAINT IF EXISTS "tesoro_raw_Car ID_key";
