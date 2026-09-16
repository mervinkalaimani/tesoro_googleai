-- Refines 20260926091000: the catalogue describes a car when it is added, and
-- again whenever an admin edits the entry — but between those, the car is its
-- owner's to edit however they like.
--
-- * The tesoro_raw trigger now fires on insert only, and skips an insert that
--   is really an edit (the app saves with INSERT ... ON CONFLICT, and a BEFORE
--   INSERT trigger runs for those too, before the conflict is found).
-- * An admin's catalogue edit writes the new description into every linked car
--   directly, since touching the rows no longer runs the copy.

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

  -- An upsert of a car this account already has is an edit, not an add.
  if exists (
    select 1 from public.tesoro_raw
    where "Car ID" = new."Car ID" and user_id is not distinct from new.user_id
  ) then
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
  before insert on public.tesoro_raw
  for each row execute function public.tesoro_raw_apply_catalog();

create or replace function public.tesoro_catalog_propagate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tesoro_raw set
    "Brand"      = new.brand,
    "Make"       = new.make,
    "Model"      = new.model,
    "Variant"    = new.variant,
    "Colour"     = new.colour,
    "Type"       = new.type,
    "Assortment" = new.assortment,
    "Series"     = new.series,
    "Sub Series" = new.sub_series,
    "Car Number" = new.car_number,
    "Size"       = coalesce(nullif(new.size, ''), "Size"),
    "MRP"        = round(coalesce(new.mrp, 0)),
    "Year"       = substring(coalesce(new.year, '') from '\d{2,4}')::numeric,
    "Name"       = coalesce(nullif(new.name, ''), "Name")
  where "Car ID" = new.car_id;
  return null;
end;
$$;

revoke all on function public.tesoro_catalog_propagate() from public, anon, authenticated;
