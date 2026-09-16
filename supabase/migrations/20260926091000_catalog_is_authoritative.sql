-- The catalogue is the one description of a casting, and only admins edit it.
--
-- * Updating tesoro_car_catalog is admin-only. Approved users can still add a
--   casting the catalogue has not seen (the app files one when a new car is
--   saved), but cannot change an existing entry.
-- * A car whose "Car ID" is in the catalogue always carries the catalogue's
--   description of it, whatever was typed when adding it: a BEFORE trigger on
--   tesoro_raw copies the catalogue fields over on every insert and update.
-- * An admin editing an entry rewrites every linked car, in every account.
--
-- Purchase details (cost, seller, dates, status, photo, rarity, condition) are
-- the owner's and are never touched.

-- 1. Who may write the catalogue ------------------------------------------------

drop policy if exists "Authenticated users can update car catalog" on public.tesoro_car_catalog;
drop policy if exists "Admins can update car catalog" on public.tesoro_car_catalog;
create policy "Admins can update car catalog"
  on public.tesoro_car_catalog for update to authenticated
  using ((select public.is_tesoro_admin((select auth.uid()))))
  with check ((select public.is_tesoro_admin((select auth.uid()))));

drop policy if exists "Authenticated users can insert into car catalog" on public.tesoro_car_catalog;
drop policy if exists "Approved users can add to car catalog" on public.tesoro_car_catalog;
create policy "Approved users can add to car catalog"
  on public.tesoro_car_catalog for insert to authenticated
  with check ((select public.is_tesoro_approved((select auth.uid()))));

-- 2. A car takes its description from the catalogue ----------------------------

create or replace function public.tesoro_raw_apply_catalog()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  c public.tesoro_car_catalog%rowtype;
begin
  if new."Car ID" is null or new."Car ID" = '' then
    return new;
  end if;

  select * into c from public.tesoro_car_catalog where car_id = new."Car ID";
  if not found then
    return new;
  end if;

  new."Brand"       := c.brand;
  new."Make"        := c.make;
  new."Model"       := c.model;
  new."Variant"     := c.variant;
  new."Colour"      := c.colour;
  new."Type"        := c.type;
  new."Assortment"  := c.assortment;
  new."Series"      := c.series;
  new."Sub Series"  := c.sub_series;
  new."Car Number"  := c.car_number;
  new."Size"        := coalesce(nullif(c.size, ''), new."Size");
  new."MRP"         := round(coalesce(c.mrp, 0));
  -- The first run of digits only, so a stray ".0" or "'71" never fails the save.
  new."Year"        := substring(coalesce(c.year, '') from '\d{2,4}')::numeric;
  if coalesce(c.name, '') <> '' then
    new."Name" := c.name;
  end if;
  return new;
end;
$$;

drop trigger if exists tesoro_raw_apply_catalog on public.tesoro_raw;
create trigger tesoro_raw_apply_catalog
  before insert or update on public.tesoro_raw
  for each row execute function public.tesoro_raw_apply_catalog();

-- 3. An edited entry reaches every linked car ----------------------------------

-- Security definer: the cars belong to other accounts, which row-level security
-- would otherwise hide from the admin making the edit. It only runs after an
-- update the policy above has already limited to admins.
create or replace function public.tesoro_catalog_propagate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The BEFORE trigger on tesoro_raw does the copying; touching the rows is
  -- enough to run it.
  update public.tesoro_raw set "Car ID" = "Car ID" where "Car ID" = new.car_id;
  return null;
end;
$$;

revoke all on function public.tesoro_catalog_propagate() from public, anon, authenticated;

drop trigger if exists tesoro_catalog_propagate on public.tesoro_car_catalog;
create trigger tesoro_catalog_propagate
  after update on public.tesoro_car_catalog
  for each row
  when (
    old.brand is distinct from new.brand or old.make is distinct from new.make
    or old.model is distinct from new.model or old.variant is distinct from new.variant
    or old.colour is distinct from new.colour or old.type is distinct from new.type
    or old.assortment is distinct from new.assortment or old.series is distinct from new.series
    or old.sub_series is distinct from new.sub_series or old.car_number is distinct from new.car_number
    or old.size is distinct from new.size or old.mrp is distinct from new.mrp
    or old.year is distinct from new.year or old.name is distinct from new.name
  )
  execute function public.tesoro_catalog_propagate();
