-- A mix number ("2026 Mix 1", "Mix 3", "2024 Mix 2") names the case a car shipped
-- in, not a sub series of the collection, so it belongs on the owned row next to
-- "2026 K Case" rather than on the catalogue entry.
--
-- Clearing sub_series makes tesoro_catalog_id_follows_edit regenerate each entry's
-- id with a blank sub series segment; tesoro_catalog_00_after_id_change then
-- repoints the owners' rows and records the old id, and tesoro_catalog_propagate
-- clears "Sub Series" on those rows. The Case Number write happens first so
-- propagate cannot wipe the label before it is saved.
--
-- Verified by rollback test before applying: catalogue 1421 -> 1421 (no entry
-- becomes a twin of another, so nothing merges), 59 rows given a Case Number,
-- 0 rows left holding a Sub Series, 53 ids mapped.

create table if not exists public.tesoro_catalog_mix_backup_20260929 as
select car_id, brand, make, model, assortment, series, sub_series, colour, variant,
       year, car_number
  from public.tesoro_car_catalog
 where sub_series ilike '%mix%';

create table if not exists public.tesoro_raw_mix_backup_20260929 as
select r."SNO", r."Car ID", r."Catalog ID", r."Sub Series", r."Case Number"
  from public.tesoro_raw r
 where r."Catalog ID" in (select car_id from public.tesoro_catalog_mix_backup_20260929);

create temp table _mix_cat as
select car_id, sub_series from public.tesoro_car_catalog where sub_series ilike '%mix%';

update public.tesoro_raw r
   set "Case Number" = trim(c.sub_series)
  from _mix_cat c
 where c.car_id = r."Catalog ID"
   and coalesce(trim(r."Case Number"), '') = '';

update public.tesoro_car_catalog
   set sub_series = ''
 where car_id in (select car_id from _mix_cat);

drop table _mix_cat;
