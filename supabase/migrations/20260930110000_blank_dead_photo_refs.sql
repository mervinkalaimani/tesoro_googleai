-- Clear every reference to a car photo whose file no longer exists.
--
-- The file mue3k8v5-4vzefkj.webp was deleted from the car-photos bucket when
-- the photo was replaced on one car, back when car-photo-field still assumed an
-- uploaded photo belonged only to the row it came from. It did not: saving a
-- car runs syncUserCarImageToCatalog, which copies the URL onto the catalogue
-- entry and from there onto every row of that casting. The URL had reached two
-- catalogue entries and fifteen rows, all Dodge Chargers — itself a leftover of
-- the older make-and-model flattening, so those fifteen were wearing one
-- another's photo long before the file went.
--
-- The browser that deleted it kept drawing the picture from its own HTTP cache.
-- Every other device asked storage and got a 400, which is how this surfaced as
-- "shows on my phone, blank on desktop, and the other way round".
--
-- The file cannot come back, and a 400 is worse than no picture: blanked, a row
-- falls back to its casting's photo, and a casting with none falls back to the
-- image search. Of the fifteen, seven land on a catalogue photo and eight on
-- the search.
--
-- The catalogue entries have to go first. Leave them and the three rows beneath
-- them inherit the same dead URL again through tesoroRawToDiecast's fallback.
--
-- Proven before applying with the usual rolled-back DO block:
--   raw blanked: 15, catalogue blanked: 2, dead left: 0, tesoro_raw total: 1615

create table if not exists public.tesoro_dead_photo_backup_20260924 (
  source      text not null,
  key         text not null,
  image_url   text,
  captured_at timestamptz not null default now()
);

alter table public.tesoro_dead_photo_backup_20260924 enable row level security;

insert into public.tesoro_dead_photo_backup_20260924 (source, key, image_url)
select 'tesoro_raw', r."SNO"::text, r."Image URL"
from public.tesoro_raw r
where r."Image URL" like '%mue3k8v5-4vzefkj.webp';

insert into public.tesoro_dead_photo_backup_20260924 (source, key, image_url)
select 'tesoro_car_catalog', c.car_id, c.image_url
from public.tesoro_car_catalog c
where c.image_url like '%mue3k8v5-4vzefkj.webp';

update public.tesoro_car_catalog
set image_url = null, updated_at = now()
where image_url like '%mue3k8v5-4vzefkj.webp';

update public.tesoro_raw
set "Image URL" = null
where "Image URL" like '%mue3k8v5-4vzefkj.webp';
