-- A casting comes in colours; the one in your hand is yours.
--
-- Until now a colour was part of what made a catalogue entry, so filing the
-- blue one of a casting the catalogue held in red minted a second entry and a
-- second catalogue ID for what is one casting in two colours. And because the
-- entry owned the colour, two triggers copied it back down onto every car
-- filed under it — so a collector's own colour could not survive being saved.
--
-- Now the entry carries the colours the casting is known in, the row carries
-- the one you own, and neither writes over the other.

-- 1. The casting's colours.
alter table public.tesoro_car_catalog
  add column if not exists colours text[] not null default '{}';

comment on column public.tesoro_car_catalog.colours is
  'Every colour this casting is known in. The entry''s own colour is the first one; a car filed under it adds its own.';

-- Seed from what the catalogue and the collections already say.
update public.tesoro_car_catalog
   set colours = array[btrim(colour)]
 where coalesce(btrim(colour), '') <> ''
   and colours = '{}';

with owned as (
  select "Catalog ID" as car_id, array_agg(distinct btrim("Colour")) as cols
    from public.tesoro_raw
   where coalesce("Catalog ID", '') <> ''
     and coalesce(btrim("Colour"), '') <> ''
   group by 1
)
update public.tesoro_car_catalog c
   set colours = (
         select array(
           select distinct on (lower(v)) v
             from unnest(c.colours || o.cols) as v
            where coalesce(btrim(v), '') <> ''
            order by lower(v), v
         )
       )
  from owned o
 where o.car_id = c.car_id;

-- 2. An entry's own colour is one of its colours.
create or replace function public.tesoro_catalog_colour_joins_the_list()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  own text := btrim(coalesce(new.colour, ''));
begin
  if own = '' then
    return new;
  end if;
  if not exists (select 1 from unnest(coalesce(new.colours, '{}')) c where lower(btrim(c)) = lower(own)) then
    new.colours := coalesce(new.colours, '{}') || own;
  end if;
  return new;
end;
$$;

drop trigger if exists tesoro_catalog_colour_joins_the_list on public.tesoro_car_catalog;
create trigger tesoro_catalog_colour_joins_the_list
before insert or update of colour, colours on public.tesoro_car_catalog
for each row execute function public.tesoro_catalog_colour_joins_the_list();

-- 3. A car's colour joins its casting's list.
--
-- Security definer because the catalogue is admin-only to write and this is
-- not an edit of it: nothing is renamed or removed, a colour is only ever
-- added, and it is added by the only person who can say the casting comes in
-- it — somebody holding one.
create or replace function public.tesoro_raw_colour_joins_the_casting()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  own text := btrim(coalesce(new."Colour", ''));
begin
  if own = '' or coalesce(new."Catalog ID", '') = '' then
    return null;
  end if;
  update public.tesoro_car_catalog
     set colours = colours || own
   where car_id = new."Catalog ID"
     and not exists (select 1 from unnest(colours) c where lower(btrim(c)) = lower(own));
  return null;
end;
$$;

drop trigger if exists tesoro_raw_colour_joins_the_casting on public.tesoro_raw;
create trigger tesoro_raw_colour_joins_the_casting
after insert or update of "Colour", "Catalog ID" on public.tesoro_raw
for each row execute function public.tesoro_raw_colour_joins_the_casting();

-- 4. The catalogue stops writing over the colour on your row.
--
-- Everything else it fills in still describes the casting, which is shared.
-- The colour is the one thing on the row that is about the copy in your hand.
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
  -- Yours if you said one, the casting's usual colour if you did not.
  new."Colour" := coalesce(nullif(btrim(coalesce(new."Colour", '')), ''), c.colour);
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
    -- Not "Colour": the casting comes in several and the row says which one
    -- is yours. A row that never said fills in from the casting.
    "Colour"     = coalesce(nullif(btrim(coalesce(r."Colour", '')), ''), new.colour),
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
                        else r."Name" end,
    admin_changed_at = case when r.user_id is distinct from auth.uid() then now()
                            else r.admin_changed_at end,
    admin_changed_by = case when r.user_id is distinct from auth.uid() then auth.uid()
                            else r.admin_changed_by end
  where r."Catalog ID" = new.car_id;
  return null;
end;
$$;
