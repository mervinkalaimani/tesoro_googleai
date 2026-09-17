-- Catalogue Car IDs move to Crockford base-32, grouped by meaning:
--
--   BBMMmm-AA-SSss-N        e.g. 0F1406-01-0E02-1
--   Brand Make Model - Assortment - Series SubSeries - Copy
--
-- Alphabet 0123456789ABCDEFGHJKMNPQRSTVWXYZ (no I, L, O, U). Every part is two
-- characters (up to 1,023) and Copy one (up to 31). Codes start at 01 in the
-- order a value first reached the catalogue; blank is 00. Model is numbered
-- within its make, series within its brand, sub series within its brand and
-- series. The numbers in tesoro_catalog_codes are the same kind as before; only
-- how they are written changes.
--
-- Before numbering: spelling duplicates are merged so they do not get codes of
-- their own, and user cars that were never filed in the catalogue are added to
-- it, so every car ends up with a catalogue ID.
--
-- After: the database resolves any Car ID that is not in this form — an old
-- ID, a temporary one, or one from an app that has not updated yet — to the
-- right catalogue ID on insert, creating the catalogue entry when there is none.

-- 0. Encoding ------------------------------------------------------------------
create or replace function public.tesoro_b32(n integer, width integer)
returns text
language sql
immutable
as $$
  select string_agg(
    substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', ((n / power(32, width - i)::integer) % 32) + 1, 1),
    '' order by i)
  from generate_series(1, width) as i;
$$;

create or replace function public.tesoro_b32_decode(t text)
returns integer
language sql
immutable
as $$
  select coalesce(sum((strpos('0123456789ABCDEFGHJKMNPQRSTVWXYZ', substr(upper(t), i, 1)) - 1)
    * power(32, length(t) - i))::integer, 0)
  from generate_series(1, length(t)) as i;
$$;

-- 1. One spelling per value ----------------------------------------------------
update public.tesoro_car_catalog set model = 'F-150', updated_at = now()
  where lower(trim(make)) = 'ford' and model = 'F150';
update public.tesoro_car_catalog set model = 'E-Type', updated_at = now()
  where lower(trim(make)) = 'jaguar' and model = 'E Type';
update public.tesoro_car_catalog set model = 'ES 300h', updated_at = now()
  where lower(trim(make)) = 'lexus' and model in ('ES 300 H', 'ES300h');
update public.tesoro_car_catalog set model = 'MC12', updated_at = now()
  where lower(trim(make)) = 'maserati' and model = 'MC 12';
update public.tesoro_car_catalog set model = 'G63', updated_at = now()
  where lower(trim(make)) = 'mercedes benz' and model = 'G-63';

-- The catalogue updates above already reach linked cars; these cover the rest.
update public.tesoro_raw set "Model" = 'F-150' where lower(trim("Make")) = 'ford' and "Model" = 'F150';
update public.tesoro_raw set "Model" = 'E-Type' where lower(trim("Make")) = 'jaguar' and "Model" = 'E Type';
update public.tesoro_raw set "Model" = 'ES 300h' where lower(trim("Make")) = 'lexus' and "Model" in ('ES 300 H', 'ES300h');
update public.tesoro_raw set "Model" = 'MC12' where lower(trim("Make")) = 'maserati' and "Model" = 'MC 12';
update public.tesoro_raw set "Model" = 'G63' where lower(trim("Make")) = 'mercedes benz' and "Model" = 'G-63';
update public.tesoro_raw set "Brand" = 'Hotwheels' where "Brand" = 'Hot Wheels';
update public.tesoro_raw set "Brand" = 'Pop Race' where "Brand" = 'POP RACE';
update public.tesoro_raw set "Brand" = 'XCARTOYS' where "Brand" = 'XCARTTOYS';
update public.tesoro_raw set "Make" = 'Oracle Red Bull' where "Make" = 'Redbull Oracle';

-- 2. Every user car in the catalogue ------------------------------------------
create table public.tesoro_raw_car_id_backup_20260927b as
  select "SNO", user_id, "Car ID" as old_car_id from public.tesoro_raw;
alter table public.tesoro_raw_car_id_backup_20260927b enable row level security;

create temp table _unfiled as
select r."SNO", r."Car ID" as old_id,
  lower(trim(r."Brand")) b, lower(trim(r."Make")) mk, lower(trim(r."Model")) md,
  lower(trim(r."Assortment")) a, lower(trim(coalesce(r."Series", ''))) s,
  lower(trim(coalesce(r."Sub Series", ''))) ss, lower(trim(coalesce(r."Car Number", ''))) cn,
  round(coalesce(r."MRP", 0)) m
from public.tesoro_raw r
where not exists (select 1 from public.tesoro_car_catalog c where c.car_id = r."Car ID");

-- One entry per casting, from the earliest car of it.
insert into public.tesoro_car_catalog (
  car_id, brand, make, model, assortment, series, sub_series, car_number, mrp, name,
  variant, year, colour, type, size, image_url, created_by, release_status, rarity, expected_date)
select 'TMP-' || r."SNO", r."Brand", r."Make", r."Model", r."Assortment", coalesce(r."Series", ''),
  coalesce(r."Sub Series", ''), coalesce(r."Car Number", ''), coalesce(r."MRP", 0), r."Name",
  coalesce(r."Variant", ''), r."Year"::text, coalesce(r."Colour", ''), r."Type", r."Size", r."Image URL",
  r.user_id,
  case when r."Status" = 'Pre Order' then 'Pre Order' else 'Released' end,
  case when r."Rarity" in ('TH', 'STH', 'Chase') then r."Rarity" else 'Normal' end,
  case when r."Status" = 'Pre Order' then nullif(r."Expected Date", '') end
from public.tesoro_raw r
where r."SNO" in (select distinct on (b, mk, md, a, s, ss, cn, m) "SNO" from _unfiled order by b, mk, md, a, s, ss, cn, m, "SNO");

create temp table _filed as
select u.old_id, u."SNO", 'TMP-' || first_value(u."SNO") over (partition by b, mk, md, a, s, ss, cn, m order by u."SNO") as tmp_id
from _unfiled u;

update public.tesoro_raw r set "Car ID" = f.tmp_id from _filed f where r."SNO" = f."SNO";

-- 3. Number everything --------------------------------------------------------
create temp table _ids as
with c as (
  select car_id, created_at,
    lower(trim(brand)) b, lower(trim(make)) mk, lower(trim(model)) md,
    lower(trim(assortment)) a, lower(trim(series)) s, lower(trim(sub_series)) ss
  from public.tesoro_car_catalog
), f as (
  select *,
    min(created_at) over (partition by b) fb,
    min(created_at) over (partition by mk) fmk,
    min(created_at) over (partition by mk, md) fmd,
    min(created_at) over (partition by a) fa,
    min(created_at) over (partition by b, s) fs,
    min(created_at) over (partition by b, s, ss) fss
  from c
)
select *,
  case when b  = '' then 0 else dense_rank() over (partition by b  = '' order by fb, b) end::integer rb,
  case when mk = '' then 0 else dense_rank() over (partition by mk = '' order by fmk, mk) end::integer rmk,
  case when md = '' then 0 else dense_rank() over (partition by mk, md = '' order by fmd, md) end::integer rmd,
  case when a  = '' then 0 else dense_rank() over (partition by a  = '' order by fa, a) end::integer ra,
  case when s  = '' then 0 else dense_rank() over (partition by b, s = '' order by fs, s) end::integer rs,
  case when ss = '' then 0 else dense_rank() over (partition by b, s, ss = '' order by fss, ss) end::integer rss,
  row_number() over (partition by b, mk, md, a, s, ss order by created_at, car_id)::integer rq
from f;

alter table _ids add column new_id text;
update _ids set new_id =
  public.tesoro_b32(rb, 2) || public.tesoro_b32(rmk, 2) || public.tesoro_b32(rmd, 2) || '-' ||
  public.tesoro_b32(ra, 2) || '-' || public.tesoro_b32(rs, 2) || public.tesoro_b32(rss, 2) || '-' ||
  public.tesoro_b32(rq, 1);

do $$
begin
  if exists (select 1 from _ids where greatest(rb, rmk, rmd, ra, rs, rss) > 1023 or rq > 31) then
    raise exception 'A code does not fit its characters';
  end if;
  if (select count(distinct new_id) from _ids) <> (select count(*) from _ids) then
    raise exception 'New Car IDs are not unique';
  end if;
end $$;

delete from public.tesoro_catalog_codes;
insert into public.tesoro_catalog_codes (kind, parent_key, value_key, code)
select distinct 'brand', '', b, rb from _ids where rb > 0
union select distinct 'make', '', mk, rmk from _ids where rmk > 0
union select distinct 'model', mk, md, rmd from _ids where rmd > 0
union select distinct 'assortment', '', a, ra from _ids where ra > 0
union select distinct 'series', b, s, rs from _ids where rs > 0
union select distinct 'sub_series', b || '|' || s, ss, rss from _ids where rss > 0;

-- 4. Old -> new, for both earlier forms ---------------------------------------
alter table public.tesoro_car_id_map drop constraint if exists tesoro_car_id_map_new_id_key;

update public.tesoro_car_id_map m set new_id = i.new_id, migrated_at = now()
from _ids i where m.new_id = i.car_id;

insert into public.tesoro_car_id_map (old_id, new_id)
select car_id, new_id from _ids where car_id not like 'TMP-%'
on conflict (old_id) do update set new_id = excluded.new_id, migrated_at = now();

insert into public.tesoro_car_id_map (old_id, new_id)
select f.old_id, i.new_id from _filed f join _ids i on i.car_id = f.tmp_id
where coalesce(f.old_id, '') <> ''
on conflict (old_id) do update set new_id = excluded.new_id, migrated_at = now();

update public.tesoro_car_catalog c set car_id = i.new_id from _ids i where c.car_id = i.car_id;
update public.tesoro_raw r set "Car ID" = i.new_id from _ids i where r."Car ID" = i.car_id;

do $$
begin
  if exists (select 1 from public.tesoro_raw r
             where not exists (select 1 from public.tesoro_car_catalog c where c.car_id = r."Car ID")) then
    raise exception 'A user car is still outside the catalogue';
  end if;
end $$;

drop table _ids;
drop table _filed;
drop table _unfiled;

-- 5. Assigning IDs from now on -----------------------------------------------
create or replace function public.tesoro_catalog_code(p_kind text, p_parent text, p_value text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c integer;
begin
  if coalesce(p_value, '') = '' then
    return 0;
  end if;
  select code into c from public.tesoro_catalog_codes
    where kind = p_kind and parent_key = p_parent and value_key = p_value;
  if found then
    return c;
  end if;
  select coalesce(max(code), 0) + 1 into c from public.tesoro_catalog_codes
    where kind = p_kind and parent_key = p_parent;
  if c > 1023 then
    raise exception 'No % codes left under "%"', p_kind, p_parent;
  end if;
  insert into public.tesoro_catalog_codes (kind, parent_key, value_key, code)
    values (p_kind, p_parent, p_value, c);
  return c;
end;
$$;

create or replace function public.tesoro_catalog_new_id(
  p_brand text, p_make text, p_model text, p_assortment text, p_series text, p_sub_series text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  b text := lower(trim(coalesce(p_brand, '')));
  mk text := lower(trim(coalesce(p_make, '')));
  s text := lower(trim(coalesce(p_series, '')));
  prefix text;
  v_copy integer;
begin
  -- One writer at a time, so two new values cannot take the same code.
  perform pg_advisory_xact_lock(hashtext('tesoro_catalog_codes'));
  prefix :=
    tesoro_b32(tesoro_catalog_code('brand', '', b), 2) ||
    tesoro_b32(tesoro_catalog_code('make', '', mk), 2) ||
    tesoro_b32(tesoro_catalog_code('model', mk, lower(trim(coalesce(p_model, '')))), 2) || '-' ||
    tesoro_b32(tesoro_catalog_code('assortment', '', lower(trim(coalesce(p_assortment, '')))), 2) || '-' ||
    tesoro_b32(tesoro_catalog_code('series', b, s), 2) ||
    tesoro_b32(tesoro_catalog_code('sub_series', b || '|' || s, lower(trim(coalesce(p_sub_series, '')))), 2);
  select coalesce(max(tesoro_b32_decode(right(car_id, 1))), 0) + 1 into v_copy
    from public.tesoro_car_catalog where car_id like prefix || '-_';
  if v_copy > 31 then
    raise exception 'No copy numbers left for %', prefix;
  end if;
  return prefix || '-' || tesoro_b32(v_copy, 1);
end;
$$;

-- New catalogue entries record the codes their ID carries (an ID the app
-- assigned itself has not been through tesoro_catalog_code).
create or replace function public.tesoro_catalog_register_codes()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  b text := lower(trim(coalesce(new.brand, '')));
  mk text := lower(trim(coalesce(new.make, '')));
  s text := lower(trim(coalesce(new.series, '')));
begin
  if new.car_id !~ '^[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]{2}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]$' then
    return null;
  end if;
  insert into public.tesoro_catalog_codes (kind, parent_key, value_key, code)
  select k, pk, v, code from (values
    ('brand', '', b, tesoro_b32_decode(substr(new.car_id, 1, 2))),
    ('make', '', mk, tesoro_b32_decode(substr(new.car_id, 3, 2))),
    ('model', mk, lower(trim(coalesce(new.model, ''))), tesoro_b32_decode(substr(new.car_id, 5, 2))),
    ('assortment', '', lower(trim(coalesce(new.assortment, ''))), tesoro_b32_decode(substr(new.car_id, 8, 2))),
    ('series', b, s, tesoro_b32_decode(substr(new.car_id, 11, 2))),
    ('sub_series', b || '|' || s, lower(trim(coalesce(new.sub_series, ''))), tesoro_b32_decode(substr(new.car_id, 13, 2)))
  ) as x(k, pk, v, code)
  where v <> '' and code > 0
  on conflict do nothing;
  return null;
end;
$$;

-- Any ID not in the base-32 form is resolved on insert: an ID already mapped
-- takes its new one; otherwise the car is matched to its catalogue entry by
-- brand, make, model, assortment, series, sub series, car number and MRP
-- (preferring the same colour and variant); failing that a new entry is made.
create or replace function public.tesoro_remap_legacy_car_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  is_raw boolean := tg_table_name = 'tesoro_raw';
  v_old text;
  resolved text;
  f record;
begin
  if is_raw then
    v_old := new."Car ID";
    select new."Brand" brand, new."Make" make, new."Model" model, new."Assortment" assortment,
      coalesce(new."Series", '') series, coalesce(new."Sub Series", '') sub_series,
      coalesce(new."Car Number", '') car_number, coalesce(new."MRP", 0)::numeric mrp,
      coalesce(new."Colour", '') colour, coalesce(new."Variant", '') variant into f;
  else
    v_old := new.car_id;
    select new.brand brand, new.make make, new.model model, new.assortment assortment,
      new.series series, new.sub_series sub_series, new.car_number car_number, new.mrp mrp,
      new.colour colour, new.variant variant into f;
  end if;

  if coalesce(v_old, '') ~ '^[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]{2}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]$' then
    return new;
  end if;

  if coalesce(v_old, '') <> '' then
    select m.new_id into resolved from public.tesoro_car_id_map m where m.old_id = v_old;
  end if;

  if resolved is null then
    select c.car_id into resolved from public.tesoro_car_catalog c
    where lower(trim(c.brand)) = lower(trim(coalesce(f.brand, '')))
      and lower(trim(c.make)) = lower(trim(coalesce(f.make, '')))
      and lower(trim(c.model)) = lower(trim(coalesce(f.model, '')))
      and lower(trim(c.assortment)) = lower(trim(coalesce(f.assortment, '')))
      and lower(trim(c.series)) = lower(trim(f.series))
      and lower(trim(c.sub_series)) = lower(trim(f.sub_series))
      and lower(trim(c.car_number)) = lower(trim(f.car_number))
      and round(c.mrp) = round(f.mrp)
    order by (lower(trim(c.colour)) = lower(trim(f.colour)) and lower(trim(c.variant)) = lower(trim(f.variant))) desc,
      (lower(trim(c.colour)) = lower(trim(f.colour))) desc, c.created_at
    limit 1;
  end if;

  if resolved is null then
    resolved := tesoro_catalog_new_id(f.brand, f.make, f.model, f.assortment, f.series, f.sub_series);
    if is_raw then
      insert into public.tesoro_car_catalog (
        car_id, brand, make, model, assortment, series, sub_series, car_number, mrp, name,
        variant, year, colour, type, size, image_url, created_by, release_status, rarity, expected_date)
      values (
        resolved, new."Brand", new."Make", new."Model", new."Assortment", f.series, f.sub_series,
        f.car_number, f.mrp, new."Name", f.variant, new."Year"::text, f.colour, new."Type", new."Size",
        new."Image URL", new.user_id,
        case when new."Status" = 'Pre Order' then 'Pre Order' else 'Released' end,
        case when new."Rarity" in ('TH', 'STH', 'Chase') then new."Rarity" else 'Normal' end,
        case when new."Status" = 'Pre Order' then nullif(new."Expected Date", '') end);
    end if;
  end if;

  if coalesce(v_old, '') <> '' then
    insert into public.tesoro_car_id_map (old_id, new_id) values (v_old, resolved)
    on conflict do nothing;
  end if;

  if is_raw then
    new."Car ID" := resolved;
  else
    new.car_id := resolved;
  end if;
  return new;
end;
$$;

-- Only the triggers assign codes; nobody calls these directly.
revoke execute on function public.tesoro_catalog_code(text, text, text) from public, anon, authenticated;
revoke execute on function public.tesoro_catalog_new_id(text, text, text, text, text, text) from public, anon, authenticated;
