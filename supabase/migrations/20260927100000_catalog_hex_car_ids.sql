-- Catalogue Car IDs become coded hex: Brand-Make-Model-Assortment-Series-SubSeries-Copy
--   BB-MMM-mmm-AA-SS-ss-CC, e.g. 0F-024-006-01-0E-02-01
--
-- Every value gets a code starting at 01 in the order it first appeared in the
-- catalogue; a blank value is always 00. Model is numbered within its make,
-- series within its brand, sub series within its brand and series. Copy
-- separates castings that share all six. Make and model take three hex digits,
-- the rest two.
--
-- The codes live in tesoro_catalog_codes so a value keeps its number for good.
-- Old IDs are kept in tesoro_car_id_map (and every raw row's old ID in a dated
-- backup), and writes that still arrive with an old ID — an app open since
-- before this ran — are mapped onto the new one instead of creating a copy.

-- 1. Codes --------------------------------------------------------------------
create table public.tesoro_catalog_codes (
  kind text not null check (kind in ('brand', 'make', 'model', 'assortment', 'series', 'sub_series')),
  parent_key text not null default '',
  value_key text not null,
  code integer not null check (code between 1 and 4095),
  created_at timestamptz not null default now(),
  primary key (kind, parent_key, value_key),
  unique (kind, parent_key, code)
);
alter table public.tesoro_catalog_codes enable row level security;
create policy "Anyone can view catalog codes" on public.tesoro_catalog_codes
  for select using (true);

-- 2. Old -> new ---------------------------------------------------------------
create table public.tesoro_car_id_map (
  old_id text primary key,
  new_id text not null unique,
  migrated_at timestamptz not null default now()
);
alter table public.tesoro_car_id_map enable row level security;

create table public.tesoro_raw_car_id_backup_20260927 as
  select "SNO", user_id, "Car ID" as old_car_id from public.tesoro_raw;
alter table public.tesoro_raw_car_id_backup_20260927 enable row level security;

-- 3. Number everything --------------------------------------------------------
create temp table _ids as
with c as (
  select car_id, created_at,
    lower(trim(coalesce(brand, ''))) b, lower(trim(coalesce(make, ''))) mk,
    lower(trim(coalesce(model, ''))) md, lower(trim(coalesce(assortment, ''))) a,
    lower(trim(coalesce(series, ''))) s, lower(trim(coalesce(sub_series, ''))) ss
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
), r as (
  select *,
    case when b  = '' then 0 else dense_rank() over (partition by b  = '' order by fb, b) end rb,
    case when mk = '' then 0 else dense_rank() over (partition by mk = '' order by fmk, mk) end rmk,
    case when md = '' then 0 else dense_rank() over (partition by mk, md = '' order by fmd, md) end rmd,
    case when a  = '' then 0 else dense_rank() over (partition by a  = '' order by fa, a) end ra,
    case when s  = '' then 0 else dense_rank() over (partition by b, s = '' order by fs, s) end rs,
    case when ss = '' then 0 else dense_rank() over (partition by b, s, ss = '' order by fss, ss) end rss,
    row_number() over (partition by b, mk, md, a, s, ss order by created_at, car_id) rq
  from f
)
select *,
  concat_ws('-',
    lpad(upper(to_hex(rb)), 2, '0'), lpad(upper(to_hex(rmk)), 3, '0'),
    lpad(upper(to_hex(rmd)), 3, '0'), lpad(upper(to_hex(ra)), 2, '0'),
    lpad(upper(to_hex(rs)), 2, '0'), lpad(upper(to_hex(rss)), 2, '0'),
    lpad(upper(to_hex(rq)), 2, '0')) new_id
from r;

do $$
begin
  if exists (select 1 from _ids where greatest(rb, ra, rs, rss, rq) > 255 or greatest(rmk, rmd) > 4095) then
    raise exception 'A code does not fit its digits';
  end if;
  if (select count(distinct new_id) from _ids) <> (select count(*) from _ids) then
    raise exception 'New Car IDs are not unique';
  end if;
end $$;

insert into public.tesoro_catalog_codes (kind, parent_key, value_key, code)
select distinct 'brand', '', b, rb from _ids where rb > 0
union select distinct 'make', '', mk, rmk from _ids where rmk > 0
union select distinct 'model', mk, md, rmd from _ids where rmd > 0
union select distinct 'assortment', '', a, ra from _ids where ra > 0
union select distinct 'series', b, s, rs from _ids where rs > 0
union select distinct 'sub_series', b || '|' || s, ss, rss from _ids where rss > 0;

insert into public.tesoro_car_id_map (old_id, new_id)
select car_id, new_id from _ids;

update public.tesoro_car_catalog c set car_id = i.new_id
from _ids i where c.car_id = i.car_id;

update public.tesoro_raw r set "Car ID" = i.new_id
from _ids i where r."Car ID" = i.car_id;

drop table _ids;

-- 4. New catalogue entries record their codes --------------------------------
create or replace function public.tesoro_catalog_register_codes()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p text[];
  b text := lower(trim(coalesce(new.brand, '')));
  s text := lower(trim(coalesce(new.series, '')));
  h int[];
begin
  if new.car_id !~ '^[0-9A-F]{2}-[0-9A-F]{3}-[0-9A-F]{3}-[0-9A-F]{2}-[0-9A-F]{2}-[0-9A-F]{2}-[0-9A-F]{2}$' then
    return null;
  end if;
  p := string_to_array(new.car_id, '-');
  select array_agg(('x' || lpad(x, 8, '0'))::bit(32)::int order by n) into h
  from unnest(p) with ordinality as t(x, n);

  insert into public.tesoro_catalog_codes (kind, parent_key, value_key, code)
  select k, pk, v, code from (values
    ('brand', '', b, h[1]),
    ('make', '', lower(trim(coalesce(new.make, ''))), h[2]),
    ('model', lower(trim(coalesce(new.make, ''))), lower(trim(coalesce(new.model, ''))), h[3]),
    ('assortment', '', lower(trim(coalesce(new.assortment, ''))), h[4]),
    ('series', b, s, h[5]),
    ('sub_series', b || '|' || s, lower(trim(coalesce(new.sub_series, ''))), h[6])
  ) as x(k, pk, v, code)
  where v <> '' and code > 0
  on conflict do nothing;
  return null;
end;
$$;

create trigger tesoro_catalog_register_codes
  after insert on public.tesoro_car_catalog
  for each row execute function public.tesoro_catalog_register_codes();

-- 5. Old IDs still arriving are mapped to the new ones -----------------------
-- Named to sort first: triggers run alphabetically, and the catalogue lookup in
-- tesoro_raw_apply_catalog has to see the new ID.
create or replace function public.tesoro_remap_legacy_car_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  mapped text;
begin
  if tg_table_name = 'tesoro_raw' then
    select new_id into mapped from public.tesoro_car_id_map where old_id = new."Car ID";
    if found then new."Car ID" := mapped; end if;
  else
    select new_id into mapped from public.tesoro_car_id_map where old_id = new.car_id;
    if found then new.car_id := mapped; end if;
  end if;
  return new;
end;
$$;

create trigger tesoro_raw_00_remap_legacy_id
  before insert on public.tesoro_raw
  for each row execute function public.tesoro_remap_legacy_car_id();

create trigger tesoro_catalog_00_remap_legacy_id
  before insert on public.tesoro_car_catalog
  for each row execute function public.tesoro_remap_legacy_car_id();
