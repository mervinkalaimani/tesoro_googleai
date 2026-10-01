-- The flag that meant "exception" was set on all but two rows.
--
-- `standalone` says an entry is its own casting and must never be offered as
-- another box of one. It is a correction for the rare pair that only looks
-- alike -- two reissues a year apart, say -- and the column was added `not null
-- default false` for exactly that reason.
--
-- It is set on 1,637 of 1,639 rows. Nothing in the app sets it in bulk and no
-- trigger on the table touches it, so it arrived from outside; 1,382 of those
-- rows have a null `updated_by`, which means nobody has ever edited them and
-- nobody can have detached them by hand either, because a hand-detach goes
-- through `updateCatalogCar` and stamps the editor.
--
-- At 99.9% the flag does not mean "exception", it means nothing: no casting
-- groups with any other, so the Mercedes-AMG GT3 Bathurst #1336 draws as two
-- castings -- the Blister and the Box -- rather than as one casting in two
-- boxes. Grouping is derived from the description again from here, and the few
-- pairs that really do only look alike get the flag back one at a time, which
-- is the use it was built for.
--
-- Every row's id is kept first, so this is exactly reversible.

create table if not exists public.tesoro_catalog_standalone_before_reset (
  car_id text primary key,
  noted_at timestamptz not null default now()
);

comment on table public.tesoro_catalog_standalone_before_reset is
  'Which catalogue entries carried standalone = true before the 2026-10-01 reset. Kept so the reset can be undone one row at a time or wholesale; safe to drop once nobody wants that.';

-- Nobody reads this through the API. It is a record for a hand on psql.
alter table public.tesoro_catalog_standalone_before_reset enable row level security;

insert into public.tesoro_catalog_standalone_before_reset (car_id)
select car_id from public.tesoro_car_catalog where standalone
on conflict (car_id) do nothing;

-- No update trigger on this table watches `standalone`: after_id_change wants
-- car_id, id_follows_edit and propagate want the description, pack_cleanup
-- wants is_multipack, colour_joins_the_list and release_stamp are UPDATE OF
-- their own columns. So this writes one boolean and fires nothing.
update public.tesoro_car_catalog set standalone = false where standalone;
