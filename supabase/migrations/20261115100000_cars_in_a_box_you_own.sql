-- A box you own, and the cars that came out of it.
--
-- A 5-pack was always one row: the box, with its cars read from the
-- catalogue's list of what is inside. That cannot say anything about *your*
-- five cars -- their colours, their condition, which one you sold -- because
-- they were never rows.
--
-- A car that came in a box now says which box row it belongs to. The box keeps
-- the price (it was bought once); its cars cost nothing of their own. Nothing
-- else changes: a car with this blank is a car on its own, exactly as before.

alter table public.tesoro_raw
  add column if not exists "Pack Of" text;

comment on column public.tesoro_raw."Pack Of" is
  'The "Car ID" of the box row this car came in, when it was filed as one of the cars inside a multipack you own.';

create index if not exists tesoro_raw_pack_of_idx
  on public.tesoro_raw ("Pack Of")
  where "Pack Of" is not null;
