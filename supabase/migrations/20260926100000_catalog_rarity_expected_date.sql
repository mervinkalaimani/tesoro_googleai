-- What the Catalog details view shows beyond the casting itself: its rarity
-- (Normal / TH / STH / Chase) and, for a pre-order, when it is expected.
-- Additive, and filled once from the cars already linked to each entry.
-- Nothing in anyone's collection is changed.

alter table public.tesoro_car_catalog
  add column if not exists rarity text not null default 'Normal',
  add column if not exists expected_date text;

alter table public.tesoro_car_catalog
  drop constraint if exists tesoro_car_catalog_rarity_check;
alter table public.tesoro_car_catalog
  add constraint tesoro_car_catalog_rarity_check
  check (rarity in ('Normal', 'TH', 'STH', 'Chase'));

-- Rarity: the rarest any linked car records. Rows from before the Rarity column
-- only know the Chase flag, and every one of those was a chase.
with r as (
  select "Car ID" as car_id,
    max(case
      when "Rarity" = 'Chase' or ("Rarity" is null and "Chase") then 3
      when "Rarity" = 'STH' then 2
      when "Rarity" = 'TH' then 1
      else 0 end) as rank
  from public.tesoro_raw group by "Car ID"
)
update public.tesoro_car_catalog c
set rarity = case r.rank when 3 then 'Chase' when 2 then 'STH' when 1 then 'TH' else 'Normal' end
from r where r.car_id = c.car_id and r.rank > 0;

-- Expected date: the earliest date any pre-order of the casting gives.
with e as (
  select "Car ID" as car_id, min("Expected Date") as expected
  from public.tesoro_raw
  where lower(trim("Status")) = 'pre order'
    and "Expected Date" ~ '^\d{4}-\d{2}-\d{2}$'
  group by "Car ID"
)
update public.tesoro_car_catalog c
set expected_date = e.expected
from e where e.car_id = c.car_id and c.release_status = 'Pre Order';
