-- The two entries 20261001081500_put_the_islands_back.sql could not reach.
--
-- The restore matches on car_id, and an entry's car_id is rewritten when its
-- brand, make, model, box, series or sub-series is edited (see
-- `tesoro_catalog_id_follows_edit`). Four of the 1,637 backed-up ids no longer
-- named a row by the time the restore ran, because those entries were edited
-- this morning while the Fast & Furious problem was being worked around by
-- hand.
--
-- Two of the four carry the flag already, having been detached by hand after
-- the edit. These two did not, and they are the pair the complaint was about: a
-- Mainline and a Premium '95 Mazda RX-7, both Fast & Furious / Anniversary,
-- both Chrome, reading as one casting in two boxes when they are two products
-- at two prices.
--
-- The other two unflagged entries in the catalogue are the Team Transport pair
-- that was deliberately attached before any of this, and they stay attached.

update public.tesoro_car_catalog
   set standalone = true
 where car_id in ('181901-03-0D04-1', '181901-06-0D04-1')
   and not standalone;
