-- Clearing catalogue photos that were never that casting's photo.
--
-- tesoro_car_catalog.image_url had drifted into a shared pool: 498 entries
-- across 66 makes were pointing at one of 170 pictures. The worst single case
-- was a Mini GT wiki shot filed against 63 castings from Bentley Mulliner to
-- Volkswagen T1; nine Nissan entries shared one R34; six Porsche 911 entries
-- shared one 992 GT3. That is what put the same picture on every BMW once
-- catalog_push_to_collections copied it down into collections.
--
-- A picture attached to more than one casting tells you nothing about either,
-- so all 498 are cleared. The 863 entries holding a picture of their own keep
-- it. Catalog › Find photos then fills the holes one casting at a time through
-- the per-car image search, which is where a per-car picture comes from.
--
-- tesoro_catalog_image_snapshot_20260924 holds every previous value.
begin;

create table if not exists public.tesoro_catalog_image_snapshot_20260924 as
select car_id, brand, make, model, variant, series, image_url, now() as captured_at
from public.tesoro_car_catalog;

alter table public.tesoro_catalog_image_snapshot_20260924 enable row level security;

update public.tesoro_car_catalog
set image_url = null
where image_url in (
  select image_url from public.tesoro_car_catalog
  where coalesce(trim(image_url), '') <> ''
  group by 1 having count(*) > 1
);

commit;
