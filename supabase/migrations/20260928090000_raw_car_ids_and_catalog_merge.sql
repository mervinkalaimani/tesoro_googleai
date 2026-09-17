-- A collection's rows and the catalogue's entries stop sharing an id.
--
--   tesoro_car_catalog.car_id   0F1406-01-0E02-1    one entry per car
--   tesoro_raw."Catalog ID"     0F1406-01-0E02-1    which car this is; repeats
--   tesoro_raw."Car ID"         MKCCB/MBX/MNL/073   one per car owned, unique
--
-- Owning the same casting five times is now five Car IDs against one catalogue
-- entry, instead of five near-identical entries. A Car ID is the owner's
-- prefix, a brand code, an assortment code and a number counted within that
-- collection — the shape the ids had before the catalogue existed.
--
-- Case and mix releases ("2026 K Case") describe the box rather than the
-- casting, so they move to the collection and stop splitting the catalogue.
--
-- Applied to production on 2026-09-17 as the sequence user_id_prefix,
-- raw_catalog_id_and_case_number_columns, catalog_merge_duplicates,
-- raw_car_id_codes, raw_car_id_plan_numbers, raw_car_id_plan_fix_codes,
-- raw_car_ids_apply, catalog_link_triggers, catalog_id_follows_edits and
-- catalog_resolve_id_on_insert. The one-off steps in those — restoring each
-- car's previous id from tesoro_raw_car_id_backup_20260927, folding 116
-- duplicate catalogue entries into 87 survivors — ran against that data and are
-- not repeated here; what follows is the schema they left behind.

-- 1. Who owns a car, in its id ------------------------------------------------
alter table public.tesoro_users add column if not exists id_prefix text unique;

create or replace function public.tesoro_assign_id_prefix(p_first text, p_last text, p_uid uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a text := upper(regexp_replace(coalesce(p_first, ''), '[^A-Za-z]', '', 'g'));
  b text := upper(regexp_replace(coalesce(p_last, ''), '[^A-Za-z]', '', 'g'));
  base text;
  hex text := upper(replace(coalesce(p_uid::text, ''), '-', ''));
  candidate text;
  n integer;
begin
  base := case
    when a <> '' and b <> '' then left(a, 1) || left(b, 1)
    when a <> '' then rpad(left(a, 2), 2, 'X')
    when b <> '' then rpad(left(b, 2), 2, 'X')
    else 'XX' end;
  if hex = '' then
    hex := upper(replace(gen_random_uuid()::text, '-', ''));
  end if;
  -- Initials plus the tail of the account id; a prefix already taken takes one
  -- more character rather than a second person sharing it.
  for n in 3..12 loop
    candidate := base || right(hex, n);
    if not exists (select 1 from public.tesoro_users where id_prefix = candidate) then
      return candidate;
    end if;
  end loop;
  raise exception 'Could not find a free prefix for %', base;
end;
$$;

create or replace function public.tesoro_users_set_id_prefix()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.id_prefix is null then
    new.id_prefix := public.tesoro_assign_id_prefix(new.first_name, new.last_name, new.auth_uid);
  end if;
  return new;
end;
$$;

drop trigger if exists tesoro_users_set_id_prefix on public.tesoro_users;
create trigger tesoro_users_set_id_prefix
  before insert on public.tesoro_users
  for each row execute function public.tesoro_users_set_id_prefix();

-- 2. The two new columns ------------------------------------------------------
alter table public.tesoro_raw add column if not exists "Catalog ID" text;
alter table public.tesoro_raw add column if not exists "Case Number" text;
create index if not exists tesoro_raw_catalog_id_idx on public.tesoro_raw ("Catalog ID");

-- One row per person per Car ID was what stopped a collection holding the same
-- casting twice; Car ID is unique outright now that it names the row.
alter table public.tesoro_raw drop constraint if exists tesoro_raw_user_car_id_key;
alter table public.tesoro_raw add constraint tesoro_raw_car_id_key unique ("Car ID");

-- 3. Brand and assortment codes ----------------------------------------------
create table if not exists public.tesoro_raw_codes (
  kind text not null check (kind in ('brand', 'assortment')),
  value_key text not null,
  code text not null,
  created_at timestamptz not null default now(),
  primary key (kind, value_key),
  unique (kind, code)
);
alter table public.tesoro_raw_codes enable row level security;
drop policy if exists "Anyone can view car id codes" on public.tesoro_raw_codes;
create policy "Anyone can view car id codes" on public.tesoro_raw_codes for select using (true);

-- Old ids keep resolving, per collection.
create table if not exists public.tesoro_raw_car_id_map (
  user_id uuid not null,
  old_id text not null,
  new_id text not null,
  migrated_at timestamptz not null default now(),
  primary key (user_id, old_id)
);
alter table public.tesoro_raw_car_id_map enable row level security;

create or replace function public.tesoro_raw_code(p_kind text, p_value text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  key text := lower(trim(coalesce(p_value, '')));
  letters text;
  candidate text;
  n integer;
begin
  select code into candidate from public.tesoro_raw_codes where kind = p_kind and value_key = key;
  if found then
    return candidate;
  end if;
  letters := upper(regexp_replace(coalesce(p_value, ''), '[^A-Za-z0-9]', '', 'g'));
  if letters = '' then
    letters := case when p_kind = 'brand' then 'GEN' else 'STD' end;
  end if;
  -- Three characters or more, so an assortment never reads as two letters.
  candidate := rpad(left(letters, 3), 3, 'X');
  n := 0;
  while exists (select 1 from public.tesoro_raw_codes where kind = p_kind and code = candidate) loop
    n := n + 1;
    if n > 99 then
      raise exception 'No % code left for "%"', p_kind, p_value;
    end if;
    candidate := rpad(left(letters, 2), 2, 'X') || to_char(n, 'FM00');
  end loop;
  insert into public.tesoro_raw_codes (kind, value_key, code) values (p_kind, key, candidate);
  return candidate;
end;
$$;
revoke execute on function public.tesoro_raw_code(text, text) from public, anon, authenticated;

create or replace function public.tesoro_raw_new_car_id(p_user uuid, p_brand text, p_assortment text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  prefix text;
  b text;
  a text;
  n integer;
begin
  perform pg_advisory_xact_lock(hashtext('tesoro_raw_car_id'));
  select id_prefix into prefix from public.tesoro_users where auth_uid::text = p_user::text;
  if prefix is null then
    prefix := 'XX' || upper(right(replace(coalesce(p_user::text, gen_random_uuid()::text), '-', ''), 3));
  end if;
  b := public.tesoro_raw_code('brand', p_brand);
  a := public.tesoro_raw_code('assortment', p_assortment);
  select coalesce(max(split_part("Car ID", '/', 4)::integer), 0) + 1 into n
  from public.tesoro_raw
  where user_id = p_user and split_part("Car ID", '/', 2) = b and split_part("Car ID", '/', 3) = a
    and "Car ID" ~ '^[A-Z0-9]{4,12}/[A-Z0-9]{3,6}/[A-Z0-9]{3,6}/[0-9]{3}$';
  if n > 999 then
    raise exception 'No numbers left for %/%/%', prefix, b, a;
  end if;
  return prefix || '/' || b || '/' || a || '/' || lpad(n::text, 3, '0');
end;
$$;
revoke execute on function public.tesoro_raw_new_car_id(uuid, text, text) from public, anon, authenticated;

-- 4. A car arriving -----------------------------------------------------------
-- Which catalogue entry it is, then which car of yours. An app that has not
-- updated yet sends the catalogue id as its Car ID, or an id from before any of
-- this; both are resolved rather than left to make copies.
create or replace function public.tesoro_remap_legacy_car_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  car_pattern constant text := '^[A-Z0-9]{4,12}/[A-Z0-9]{3,6}/[A-Z0-9]{3,6}/[0-9]{3}$';
  cat_pattern constant text := '^[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]{2}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]$';
  sent_car text := coalesce(new."Car ID", '');
  cid text := coalesce(new."Catalog ID", '');
  mapped text;
begin
  if cid = '' or not exists (select 1 from public.tesoro_car_catalog where car_id = cid) then
    if cid <> '' then
      select m.new_id into mapped from public.tesoro_car_id_map m where m.old_id = cid;
    end if;
    if mapped is null and sent_car <> '' and sent_car !~ car_pattern then
      select m.new_id into mapped from public.tesoro_car_id_map m where m.old_id = sent_car;
    end if;
    if mapped is null then
      select c.car_id into mapped from public.tesoro_car_catalog c
      where lower(trim(c.brand)) = lower(trim(coalesce(new."Brand", '')))
        and lower(trim(c.make)) = lower(trim(coalesce(new."Make", '')))
        and lower(trim(c.model)) = lower(trim(coalesce(new."Model", '')))
        and lower(trim(c.assortment)) = lower(trim(coalesce(new."Assortment", '')))
        and lower(trim(c.series)) = lower(trim(coalesce(new."Series", '')))
        and lower(trim(c.sub_series)) = lower(trim(coalesce(new."Sub Series", '')))
        and lower(trim(c.car_number)) = lower(trim(coalesce(new."Car Number", '')))
        and round(c.mrp) = round(coalesce(new."MRP", 0))
      order by (lower(trim(c.colour)) = lower(trim(coalesce(new."Colour", '')))
                and lower(trim(c.variant)) = lower(trim(coalesce(new."Variant", '')))) desc,
        (lower(trim(c.colour)) = lower(trim(coalesce(new."Colour", '')))) desc, c.created_at
      limit 1;
    end if;
    if mapped is null then
      mapped := public.tesoro_catalog_new_id(new."Brand", new."Make", new."Model", new."Assortment",
        coalesce(new."Series", ''), coalesce(new."Sub Series", ''));
      insert into public.tesoro_car_catalog (
        car_id, brand, make, model, assortment, series, sub_series, car_number, mrp, name,
        variant, year, colour, type, size, image_url, created_by, release_status, rarity, expected_date)
      values (
        mapped, new."Brand", new."Make", new."Model", new."Assortment", coalesce(new."Series", ''),
        coalesce(new."Sub Series", ''), coalesce(new."Car Number", ''), coalesce(new."MRP", 0), new."Name",
        coalesce(new."Variant", ''), new."Year"::text, coalesce(new."Colour", ''), new."Type", new."Size",
        new."Image URL", new.user_id,
        case when new."Status" = 'Pre Order' then 'Pre Order' else 'Released' end,
        case when new."Rarity" in ('TH', 'STH', 'Chase') then new."Rarity" else 'Normal' end,
        case when new."Status" = 'Pre Order' then nullif(new."Expected Date", '') end);
    end if;
    new."Catalog ID" := mapped;
    if cid <> '' and cid ~ cat_pattern then
      insert into public.tesoro_car_id_map (old_id, new_id) values (cid, mapped) on conflict do nothing;
    end if;
  end if;

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
end;
$$;

-- The catalogue fills in what a car is, matched on the catalogue id.
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
  new."MRP" := round(coalesce(c.mrp, 0));
  new."Year" := substring(coalesce(c.year, '') from '\d{2,4}')::numeric;
  if coalesce(c.name, '') <> '' then
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
  where "Catalog ID" = new.car_id;
  return null;
end;
$$;

-- 5. A catalogue entry arriving ----------------------------------------------
-- The collection trigger and the catalogue trigger no longer read the same
-- columns, so the catalogue has its own.
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
      and round(c.mrp) = round(coalesce(new.mrp, 0))
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

drop trigger if exists tesoro_catalog_00_remap_legacy_id on public.tesoro_car_catalog;
drop trigger if exists tesoro_catalog_00_resolve_id on public.tesoro_car_catalog;
create trigger tesoro_catalog_00_resolve_id
  before insert on public.tesoro_car_catalog
  for each row execute function public.tesoro_catalog_resolve_id();

-- 6. A catalogue id follows an edit ------------------------------------------
-- The id spells out brand, make, model, assortment, series and sub series, so
-- correcting one of those works the id out again; a code never means two
-- things. Collections follow, and the old id keeps resolving.
create or replace function public.tesoro_catalog_id_follows_edit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  fresh text;
begin
  fresh := public.tesoro_catalog_new_id(new.brand, new.make, new.model, new.assortment, new.series, new.sub_series);
  -- new_id hands back the next free copy; keep this row's id when only the copy differs.
  if left(fresh, length(fresh) - 2) <> left(new.car_id, length(new.car_id) - 2) then
    new.car_id := fresh;
  end if;
  return new;
end;
$$;

drop trigger if exists tesoro_catalog_id_follows_edit on public.tesoro_car_catalog;
create trigger tesoro_catalog_id_follows_edit
  before update on public.tesoro_car_catalog
  for each row
  when (old.brand is distinct from new.brand
     or old.make is distinct from new.make
     or old.model is distinct from new.model
     or old.assortment is distinct from new.assortment
     or old.series is distinct from new.series
     or old.sub_series is distinct from new.sub_series)
  execute function public.tesoro_catalog_id_follows_edit();

create or replace function public.tesoro_catalog_after_id_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  twin text;
begin
  update public.tesoro_raw set "Catalog ID" = new.car_id where "Catalog ID" = old.car_id;
  update public.tesoro_car_id_map set new_id = new.car_id, migrated_at = now() where new_id = old.car_id;
  insert into public.tesoro_car_id_map (old_id, new_id) values (old.car_id, new.car_id)
    on conflict (old_id) do update set new_id = excluded.new_id, migrated_at = now();

  -- The edit may have turned this entry into one the catalogue already holds.
  select c.car_id into twin from public.tesoro_car_catalog c
  where c.car_id <> new.car_id
    and lower(trim(c.brand)) = lower(trim(new.brand))
    and lower(trim(c.make)) = lower(trim(new.make))
    and lower(trim(c.model)) = lower(trim(new.model))
    and lower(trim(c.assortment)) = lower(trim(new.assortment))
    and lower(trim(c.series)) = lower(trim(new.series))
    and lower(trim(c.sub_series)) = lower(trim(new.sub_series))
    and lower(trim(c.colour)) = lower(trim(new.colour))
    and lower(trim(c.variant)) = lower(trim(new.variant))
    and coalesce(c.year, '') = coalesce(new.year, '')
    and lower(trim(c.car_number)) = lower(trim(new.car_number))
  order by c.created_at, c.car_id
  limit 1;

  if twin is not null then
    update public.tesoro_raw set "Catalog ID" = twin where "Catalog ID" = new.car_id;
    update public.tesoro_car_id_map set new_id = twin, migrated_at = now() where new_id = new.car_id;
    insert into public.tesoro_car_id_map (old_id, new_id) values (new.car_id, twin)
      on conflict (old_id) do update set new_id = excluded.new_id, migrated_at = now();
    delete from public.tesoro_car_catalog where car_id = new.car_id;
  end if;
  return null;
end;
$$;

-- Named to run before tesoro_catalog_propagate, which matches on the new id.
drop trigger if exists tesoro_catalog_00_after_id_change on public.tesoro_car_catalog;
create trigger tesoro_catalog_00_after_id_change
  after update on public.tesoro_car_catalog
  for each row
  when (old.car_id is distinct from new.car_id)
  execute function public.tesoro_catalog_after_id_change();
