-- A car row records when it arrived, and whether the catalogue has heard of it.
--
-- 20260930130000_your_price_and_name_are_yours.sql argued against exactly this
-- column: a timestamp would cost "a column, a stamping trigger and a flag" for
-- a problem a three-way merge solved more cheaply. That was right for that
-- problem. This is a different one.
--
-- A bulk import last night filed 101 catalogue entries for 45 cars -- every
-- casting twice, some three times -- and nobody could ask "what went in last
-- night?", because the only clock on a car row is SNO, and SNO says what order
-- rows arrived in, not when. The window had to be reconstructed from the
-- catalogue's own created_at, which only worked because the same burst created
-- those entries too.
--
-- Three things go on the row:
--
--   created_at        when the car reached the collection.
--   catalog_pending_at  when it was imported and held. A car lands in its
--                     owner's collection at once, but the *shared* catalogue
--                     waits a day, so a bad import can be fixed before it
--                     spreads. Null means the hold is over, or never applied.
--   admin_changed_at / admin_changed_by / owner_seen_at
--                     an admin edited somebody else's car, and whether the
--                     owner has looked since.
--
-- created_at is deliberately nullable with no default for the back-fill. The
-- date comes from the catalogue entry the car points at -- the day that casting
-- was first filed is the closest true thing we have -- and a row whose entry is
-- gone keeps an honest blank rather than a date invented today. New rows get
-- now() from the default set at the end.
--
-- What that back-fill can and cannot say, measured before running it: all 1,630
-- rows find an entry, so none stay blank, but the earliest date any of them can
-- get is 2026-09-15 -- the day the catalogue itself was seeded. A car bought in
-- 2024 therefore reads as mid-September, because that is when this database
-- first heard of its casting. The column is truthful about rows added from here
-- on, and approximate about everything before it existed. Use "Date" (the
-- received date) when you want to know when a car was actually bought.

alter table public.tesoro_raw
  add column if not exists created_at timestamptz,
  add column if not exists catalog_pending_at timestamptz,
  add column if not exists admin_changed_at timestamptz,
  add column if not exists admin_changed_by uuid,
  add column if not exists owner_seen_at timestamptz;

update public.tesoro_raw r
   set created_at = c.created_at
  from public.tesoro_car_catalog c
 where r.created_at is null
   and upper(trim(coalesce(r."Catalog ID", ''))) = upper(trim(coalesce(c.car_id, '')))
   and c.created_at is not null;

alter table public.tesoro_raw
  alter column created_at set default now();

-- The hold is read constantly -- every notice about a pending car, and the
-- promotion sweep every ten minutes -- and matches a handful of rows out of
-- sixteen hundred, so it is worth an index of its own. The rest are read one
-- row at a time and are not.
create index if not exists tesoro_raw_catalog_pending_idx
  on public.tesoro_raw (catalog_pending_at)
  where catalog_pending_at is not null;

comment on column public.tesoro_raw.created_at is
  'When the car reached the collection. Back-filled from the catalogue entry''s created_at; null where that entry is gone.';
comment on column public.tesoro_raw.catalog_pending_at is
  'Set while an imported car is held back from the shared catalogue. Null once promoted.';
comment on column public.tesoro_raw.admin_changed_at is
  'When an admin last edited this car on the owner''s behalf.';
comment on column public.tesoro_raw.owner_seen_at is
  'When the owner last opened this car. Older than admin_changed_at means there is a change they have not seen.';
