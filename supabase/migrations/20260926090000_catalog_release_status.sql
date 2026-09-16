-- Whether a catalogue casting is out, or can only be pre-ordered so far.
-- Drives the Catalog page's [All | Released | Pre Order] segment. Additive:
-- every existing casting reads as Released until someone says otherwise.

alter table public.tesoro_car_catalog
  add column if not exists release_status text not null default 'Released';

alter table public.tesoro_car_catalog
  drop constraint if exists tesoro_car_catalog_release_status_check;
alter table public.tesoro_car_catalog
  add constraint tesoro_car_catalog_release_status_check
  check (release_status in ('Released', 'Pre Order'));

comment on column public.tesoro_car_catalog.release_status is
  'Whether the casting is out (Released) or only available to pre-order (Pre Order).';
