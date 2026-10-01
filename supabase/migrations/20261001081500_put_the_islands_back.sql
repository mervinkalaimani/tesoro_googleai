-- Undoing 20261001060000_every_casting_was_its_own_island.sql, as asked.
--
-- Clearing `standalone` everywhere let the description decide what one casting
-- is, and the description is not enough for Hot Wheels: it prints a position
-- rather than a number, so Fast & Furious turned up as the worst case of it --
-- a Silver Series car, a Premium and a Mainline of the same set reading as one
-- casting in three boxes when they are three products. Four of them had already
-- been detached by hand this morning, which is the fix applied one row at a
-- time to a column that was holding the line for all 1,637.
--
-- So the flag goes back exactly as it was. Every id was kept in
-- `tesoro_catalog_standalone_before_reset`, which is what makes this exact.
--
-- Two things do not come back, and cannot:
--   * 4 of the 1,637 ids no longer name a row. Editing an entry's brand, make,
--     model, box, series or sub-series rewrites its car_id (see
--     `tesoro_catalog_id_follows_edit`), and those four were edited this
--     morning -- three of them are the RX-7s that were then detached by hand,
--     so they carry the flag already under their new ids.
--   * The rows detached by hand since the reset keep their flag. They are not
--     in the backup and are not touched here.
--
-- The backup table stays. It is the record of what this restored, and dropping
-- it would make this migration the last word on a column it only put back.

update public.tesoro_car_catalog c
   set standalone = true
  from public.tesoro_catalog_standalone_before_reset b
 where c.car_id = b.car_id
   and not c.standalone;
