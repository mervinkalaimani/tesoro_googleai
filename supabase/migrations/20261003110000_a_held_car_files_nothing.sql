-- A held car files no casting until its day is up.
--
-- The catalogue entry for a new casting is not written by the app at all: it is
-- minted inside tesoro_remap_legacy_car_id, the BEFORE INSERT trigger that
-- decides which catalogue entry a car row points at. If it cannot find one it
-- creates one, on the spot, in the same statement that saves the car. That is
-- why last night's import filed 101 entries nobody reviewed -- suppressing the
-- app's own catalogue writes would not have stopped a single one of them.
--
-- The trigger's first half is therefore split in two:
--
--   tesoro_catalog_match(row)  which existing entry this car is, or null.
--                              Pure lookup: the ID it was sent, the rename map,
--                              then brand/make/model/assortment/series/
--                              sub series/car number/MRP, preferring the entry
--                              whose colour and variant agree.
--   tesoro_catalog_file(row)   the same, and mints an entry when there is no
--                              match. This is the only place a casting is born.
--
-- A row arriving with catalog_pending_at set gets match only. It keeps whatever
-- entry it genuinely belongs to -- most imported cars are castings somebody
-- already filed -- and a casting nobody has ever filed leaves the Catalog ID
-- blank for the length of the hold, which is precisely the "New" the import
-- preview warns about. Nothing is reserved, so no ID is held hostage by a row
-- that may yet be corrected or deleted.
--
-- promote_staged_cars then calls tesoro_catalog_file on each row whose day is
-- up, which is the same door the trigger uses, so a promoted casting is filed
-- exactly as a hand-added one would have been.

create or replace function public.tesoro_catalog_match(r public.tesoro_raw)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  cat_pattern constant text := '^[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]{2}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]$';
  car_pattern constant text := '^[A-Z0-9]{4,12}/[A-Z0-9]{3,6}/[A-Z0-9]{3,6}/[0-9]{3}$';
  sent_car text := coalesce(r."Car ID", '');
  cid text := coalesce(r."Catalog ID", '');
  mapped text;
begin
  -- The entry it already names, when that entry is real.
  if cid <> '' and exists (select 1 from public.tesoro_car_catalog where car_id = cid) then
    return cid;
  end if;

  if cid <> '' then
    select m.new_id into mapped from public.tesoro_car_id_map m where m.old_id = cid;
  end if;

  -- A legacy Car ID could name a catalogue entry that has since been renamed.
  if mapped is null and sent_car <> '' and sent_car !~ car_pattern then
    select m.new_id into mapped from public.tesoro_car_id_map m where m.old_id = sent_car;
  end if;

  if mapped is null then
    select c.car_id into mapped from public.tesoro_car_catalog c
    where lower(trim(c.brand)) = lower(trim(coalesce(r."Brand", '')))
      and lower(trim(c.make)) = lower(trim(coalesce(r."Make", '')))
      and lower(trim(c.model)) = lower(trim(coalesce(r."Model", '')))
      and lower(trim(c.assortment)) = lower(trim(coalesce(r."Assortment", '')))
      and lower(trim(c.series)) = lower(trim(coalesce(r."Series", '')))
      and lower(trim(c.sub_series)) = lower(trim(coalesce(r."Sub Series", '')))
      and lower(trim(c.car_number)) = lower(trim(coalesce(r."Car Number", '')))
      and round(c.mrp) = round(coalesce(r."MRP", 0))
    order by (lower(trim(c.colour)) = lower(trim(coalesce(r."Colour", '')))
              and lower(trim(c.variant)) = lower(trim(coalesce(r."Variant", '')))) desc,
      (lower(trim(c.colour)) = lower(trim(coalesce(r."Colour", '')))) desc, c.created_at
    limit 1;
  end if;

  -- The cat_pattern check is the caller's business (recording a rename), not
  -- this one's; it only answers which entry, if any.
  if mapped is null then
    return null;
  end if;
  return mapped;
end $function$;

create or replace function public.tesoro_catalog_file(r public.tesoro_raw)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cat_pattern constant text := '^[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]{2}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]$';
  cid text := coalesce(r."Catalog ID", '');
  mapped text := public.tesoro_catalog_match(r);
begin
  if mapped is null then
    mapped := public.tesoro_catalog_new_id(r."Brand", r."Make", r."Model", r."Assortment",
      coalesce(r."Series", ''), coalesce(r."Sub Series", ''));
    insert into public.tesoro_car_catalog (
      car_id, brand, make, model, assortment, series, sub_series, car_number, mrp, name,
      variant, year, colour, type, size, image_url, created_by, release_status, rarity, expected_date)
    values (
      mapped, r."Brand", r."Make", r."Model", r."Assortment", coalesce(r."Series", ''),
      coalesce(r."Sub Series", ''), coalesce(r."Car Number", ''), coalesce(r."MRP", 0), r."Name",
      coalesce(r."Variant", ''), r."Year"::text, coalesce(r."Colour", ''), r."Type", r."Size",
      r."Image URL", r.user_id,
      case when r."Status" = 'Pre Order' then 'Pre Order' else 'Released' end,
      case when r."Rarity" in ('TH', 'STH', 'Chase') then r."Rarity" else 'Normal' end,
      case when r."Status" = 'Pre Order' then nullif(r."Expected Date", '') end);
  end if;

  if cid <> '' and cid <> mapped and cid ~ cat_pattern then
    insert into public.tesoro_car_id_map (old_id, new_id) values (cid, mapped) on conflict do nothing;
  end if;

  return mapped;
end $function$;

-- The trigger, now deciding only whether this row is allowed to file a casting.
create or replace function public.tesoro_remap_legacy_car_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  car_pattern constant text := '^[A-Z0-9]{4,12}/[A-Z0-9]{3,6}/[A-Z0-9]{3,6}/[0-9]{3}$';
  sent_car text := coalesce(new."Car ID", '');
  cid text := coalesce(new."Catalog ID", '');
  mapped text;
begin
  -- 1. which catalogue entry
  if cid = '' or not exists (select 1 from public.tesoro_car_catalog where car_id = cid) then
    if new.catalog_pending_at is not null then
      -- Held: it may join a casting that exists, but it may not create one.
      new."Catalog ID" := coalesce(public.tesoro_catalog_match(new), '');
    else
      new."Catalog ID" := public.tesoro_catalog_file(new);
    end if;
  end if;

  -- 2. which car of yours
  if sent_car !~ car_pattern then
    mapped := null;
    if sent_car <> '' then
      select m.new_id into mapped from public.tesoro_raw_car_id_map m
      where m.user_id = new.user_id and m.old_id = sent_car;
    end if;
    if mapped is null then
      mapped := public.tesoro_raw_new_car_id(new.user_id, new."Brand", new."Assortment");
      if sent_car <> '' then
        insert into public.tesoro_raw_car_id_map (user_id, old_id, new_id)
          values (new.user_id, sent_car, mapped) on conflict do nothing;
      end if;
    end if;
    new."Car ID" := mapped;
  end if;
  return new;
end $function$;

-- Promotion: the same door, opened a day later.
create or replace function public.promote_staged_cars(_older_than interval default interval '24 hours')
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  due public.tesoro_raw;
  filed text;
  moved integer := 0;
begin
  for due in
    select * from public.tesoro_raw
     where catalog_pending_at is not null
       and catalog_pending_at <= now() - _older_than
     order by "SNO"
  loop
    filed := public.tesoro_catalog_file(due);
    update public.tesoro_raw
       set "Catalog ID" = filed,
           catalog_pending_at = null
     where "SNO" = due."SNO";
    moved := moved + 1;
  end loop;
  return moved;
end $function$;

revoke all on function public.promote_staged_cars(interval) from public;
grant execute on function public.promote_staged_cars(interval) to service_role;
