-- Your price and your name stay yours.
--
-- The catalogue is the authority on what a casting *is* — brand, model, colour,
-- series, car number. It is not the authority on the two columns that are about
-- you rather than about the car:
--
--   * "MRP"  — the catalogue's figure is a reference price, for somebody meeting
--     the casting for the first time. What the card said where you bought it
--     belongs on your row.
--   * "Name" — what you call your copy.
--
-- Three separate paths rewrote both: the insert trigger stamped the catalogue
-- price over whatever you typed while adding a car, this propagate trigger
-- rewrote every owner's row whenever an admin edited the entry, and the client
-- did it again on the way past (fixed separately, in src/lib/catalog-sync.ts).
--
-- The test for "is this column yours" needs no new column and no timestamp,
-- because the trigger is handed both sides of the edit. It is a three-way merge,
-- the same one git does:
--
--   old.mrp   what the catalogue said before this edit — the base
--   new.mrp   what it says now                         — theirs
--   r."MRP"   what your row says                       — yours
--
-- Your row still matching the base means you never changed it, so the new value
-- lands. Diverging from the base means the value is yours, and it stays. Each
-- column is judged on its own, so renaming a car does not freeze its price.
--
-- Today that protects 13 rows on price and 7 on name, out of 1,622 linked.
--
-- The one case it cannot see: you deliberately typed the same price the
-- catalogue already carried. Your row matches the base, so it reads as
-- inherited, and a later correction moves it. A timestamp column would catch
-- that and cost a column, a stamping trigger and a flag to keep the catalogue's
-- own writes from setting it — for a case where your number and the shared
-- number agreed anyway.
--
-- tesoro_catalog_resolve_id loses mrp from its match key here for the reason it
-- left sameCasting in src/lib/car-id.ts: a price is not an identity, and
-- comparing it filed the same casting twice at two prices. Ten of the
-- catalogue's duplicate pairs are identical but for the rupees.
--
-- "Image URL" needs none of this. The catalogue stopped writing it in
-- 20260924090000_catalog_push_stops_touching_images.sql.

-- 1. Adding a car ------------------------------------------------------------
-- What you typed wins; what you left empty is filled from the catalogue.
create or replace function public.tesoro_raw_apply_catalog()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  c public.tesoro_car_catalog%rowtype;
begin
  if new."Catalog ID" is null or new."Catalog ID" = '' then
    return new;
  end if;
  select * into c from public.tesoro_car_catalog where car_id = new."Catalog ID";
  if not found then
    return new;
  end if;
  new."Brand" := c.brand;
  new."Make" := c.make;
  new."Model" := c.model;
  new."Variant" := c.variant;
  new."Colour" := c.colour;
  new."Type" := c.type;
  new."Assortment" := c.assortment;
  new."Series" := c.series;
  new."Sub Series" := c.sub_series;
  new."Car Number" := c.car_number;
  new."Size" := coalesce(nullif(c.size, ''), new."Size");
  new."Year" := substring(coalesce(c.year, '') from '\d{2,4}')::numeric;
  if coalesce(new."MRP", 0) = 0 then
    new."MRP" := round(coalesce(c.mrp, 0));
  end if;
  if coalesce(new."Name", '') = '' then
    new."Name" := c.name;
  end if;
  return new;
end;
$$;

-- 2. An admin editing the catalogue entry ------------------------------------
create or replace function public.tesoro_catalog_propagate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.tesoro_raw r set
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
    "Size"       = coalesce(nullif(new.size, ''), r."Size"),
    "Year"       = substring(coalesce(new.year, '') from '\d{2,4}')::numeric,
    "MRP"        = case when r."MRP" is not distinct from round(coalesce(old.mrp, 0))
                        then round(coalesce(new.mrp, 0))
                        else r."MRP" end,
    "Name"       = case when coalesce(r."Name", '') is not distinct from coalesce(old.name, '')
                        then coalesce(nullif(new.name, ''), r."Name")
                        else r."Name" end
  where r."Catalog ID" = new.car_id;
  return null;
end;
$$;

-- 3. A price is not an identity ----------------------------------------------
create or replace function public.tesoro_catalog_resolve_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  cat_pattern constant text := '^[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]{2}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]$';
  sent text := coalesce(new.car_id, '');
  resolved text;
begin
  if sent ~ cat_pattern then
    return new;
  end if;
  if sent <> '' then
    select m.new_id into resolved from public.tesoro_car_id_map m where m.old_id = sent;
  end if;
  if resolved is null then
    select c.car_id into resolved from public.tesoro_car_catalog c
    where lower(trim(c.brand)) = lower(trim(coalesce(new.brand, '')))
      and lower(trim(c.make)) = lower(trim(coalesce(new.make, '')))
      and lower(trim(c.model)) = lower(trim(coalesce(new.model, '')))
      and lower(trim(c.assortment)) = lower(trim(coalesce(new.assortment, '')))
      and lower(trim(c.series)) = lower(trim(coalesce(new.series, '')))
      and lower(trim(c.sub_series)) = lower(trim(coalesce(new.sub_series, '')))
      and lower(trim(c.car_number)) = lower(trim(coalesce(new.car_number, '')))
    order by (lower(trim(c.colour)) = lower(trim(coalesce(new.colour, '')))
              and lower(trim(c.variant)) = lower(trim(coalesce(new.variant, '')))) desc,
      (lower(trim(c.colour)) = lower(trim(coalesce(new.colour, '')))) desc, c.created_at
    limit 1;
  end if;
  if resolved is null then
    resolved := public.tesoro_catalog_new_id(new.brand, new.make, new.model, new.assortment,
      coalesce(new.series, ''), coalesce(new.sub_series, ''));
  end if;
  if sent <> '' then
    insert into public.tesoro_car_id_map (old_id, new_id) values (sent, resolved) on conflict do nothing;
  end if;
  new.car_id := resolved;
  return new;
end;
$$;
