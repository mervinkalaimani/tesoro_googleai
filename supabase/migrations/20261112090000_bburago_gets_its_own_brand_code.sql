-- Bburago and BBR Models shared the brand code BBR in Car IDs.
--
--   MKCCB/BBR/BOX/001    a Bburago car, carrying BBR's code
--
-- Bburago held the code BBR in tesoro_raw_codes and BBR Models had no row. Give
-- each its own — BBR for BBR Models, BUR for Bburago — so a new car of either
-- brand gets the right one, then renumber the
-- Bburago cars already in collections from 001 under BUR.
--
-- The old ids are kept in tesoro_raw_car_id_backup_20261112 and in
-- tesoro_raw_car_id_map, so anything still holding one resolves to the new id.

update public.tesoro_raw_codes set code = 'BUR'
where kind = 'brand' and value_key = 'bburago' and code = 'BBR';
insert into public.tesoro_raw_codes (kind, value_key, code)
values ('brand', 'bbr', 'BBR') on conflict do nothing;

create table if not exists public.tesoro_raw_car_id_backup_20261112 as
select user_id, "Car ID" as old_car_id
from public.tesoro_raw
where lower(trim("Brand")) = 'bburago'
  and split_part("Car ID", '/', 2) = 'BBR';

with plan as (
  select
    r.user_id,
    r."Car ID" as old_id,
    split_part(r."Car ID", '/', 1) || '/BUR/' || split_part(r."Car ID", '/', 3) || '/' ||
      lpad(row_number() over (
        partition by r.user_id, split_part(r."Car ID", '/', 3)
        order by split_part(r."Car ID", '/', 4)::integer, r."Car ID"
      )::text, 3, '0') as new_id
  from public.tesoro_raw r
  where lower(trim(r."Brand")) = 'bburago'
    and split_part(r."Car ID", '/', 2) = 'BBR'
    and r."Car ID" ~ '^[A-Z0-9]{4,12}/[A-Z0-9]{3,6}/[A-Z0-9]{3,6}/[0-9]{3}$'
),
mapped as (
  insert into public.tesoro_raw_car_id_map (user_id, old_id, new_id)
  select user_id, old_id, new_id from plan
  on conflict do nothing
  returning 1
)
update public.tesoro_raw r
set "Car ID" = plan.new_id
from plan
where r.user_id = plan.user_id and r."Car ID" = plan.old_id;
