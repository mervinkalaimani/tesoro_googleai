-- An assortment exists because somebody keeps it, not because a car spells it.
--
-- Today the list of assortments is whatever the collection happens to contain,
-- so every typo is an assortment: "Acrylic case" and "Acrylic Case" are two
-- lines in every dropdown, and nothing can be corrected because there is
-- nothing to correct -- the spelling only lives on the cars.
--
-- A table fixes both halves. A name can exist before any car uses it, and
-- renaming one rewrites every car and catalogue entry that used the old
-- spelling, which is what merges two spellings into one: rename "Acrylic" to
-- "Acrylic case" and next time there is one option, not two.
--
-- Seeded from what is already spelled, one row per distinct name after a
-- case-insensitive merge, keeping the spelling the most cars use -- so the
-- majority spelling wins and the stragglers are a rename away.

create table if not exists public.tesoro_assortments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Most assortments belong to one brand ("Mainline" is Hot Wheels, "Moving
  -- Parts" is Matchbox), but some are a shape of packaging anybody uses
  -- ("Box", "Blister"), and those carry no brand.
  brand text not null default '',
  sort smallint not null default 0,
  -- Kept for the cars that already use it, hidden from the pickers. Deleting an
  -- assortment somebody owns would silently blank their car.
  retired boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists tesoro_assortments_name_idx
  on public.tesoro_assortments (lower(trim(name)), lower(trim(brand)));

alter table public.tesoro_assortments enable row level security;

drop policy if exists "assortments are readable by everyone" on public.tesoro_assortments;
create policy "assortments are readable by everyone"
  on public.tesoro_assortments for select using (true);

drop policy if exists "assortments are written by admins" on public.tesoro_assortments;
create policy "assortments are written by admins"
  on public.tesoro_assortments for all
  using (public.is_tesoro_admin(auth.uid()))
  with check (public.is_tesoro_admin(auth.uid()));

-- The spelling the most cars use, per case-insensitive name.
insert into public.tesoro_assortments (name, brand)
select spelling, ''
from (
  select lower(trim(a)) as key,
         (array_agg(a order by n desc, a))[1] as spelling
  from (
    select coalesce(nullif(trim("Assortment"), ''), null) as a, count(*) as n
      from public.tesoro_raw
     where coalesce(trim("Assortment"), '') <> ''
     group by 1
    union all
    select coalesce(nullif(trim(assortment), ''), null) as a, count(*) as n
      from public.tesoro_car_catalog
     where coalesce(trim(assortment), '') <> ''
     group by 1
  ) spellings
  group by 1
) winners
on conflict do nothing;

/**
 * Rename an assortment everywhere it is written.
 *
 * Merging is the same operation as renaming: if the new name already exists,
 * the cars move onto it and the old row goes. That is what turns two spellings
 * of one thing into one thing.
 */
create or replace function public.tesoro_rename_assortment(_from text, _to text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  moved integer := 0;
  cleaned text := trim(_to);
begin
  if not public.is_tesoro_admin(auth.uid()) then
    raise exception 'Only an admin can rename an assortment';
  end if;
  if cleaned = '' then
    raise exception 'An assortment needs a name';
  end if;

  update public.tesoro_raw
     set "Assortment" = cleaned
   where lower(trim("Assortment")) = lower(trim(_from));
  get diagnostics moved = row_count;

  update public.tesoro_car_catalog
     set assortment = cleaned
   where lower(trim(assortment)) = lower(trim(_from));

  -- The list itself: the target keeps its row, the old name loses its.
  if exists (select 1 from public.tesoro_assortments where lower(trim(name)) = lower(trim(cleaned))) then
    delete from public.tesoro_assortments where lower(trim(name)) = lower(trim(_from))
      and lower(trim(name)) <> lower(trim(cleaned));
  else
    update public.tesoro_assortments set name = cleaned
     where lower(trim(name)) = lower(trim(_from));
  end if;

  return moved;
end $function$;

grant execute on function public.tesoro_rename_assortment(text, text) to authenticated;

/** How many cars and entries use each assortment, so the page can refuse a delete. */
create or replace function public.tesoro_assortment_usage()
returns table (name text, cars bigint, entries bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select a.name,
         (select count(*) from public.tesoro_raw r
           where lower(trim(r."Assortment")) = lower(trim(a.name))),
         (select count(*) from public.tesoro_car_catalog c
           where lower(trim(c.assortment)) = lower(trim(a.name)))
    from public.tesoro_assortments a;
$function$;

grant execute on function public.tesoro_assortment_usage() to authenticated, anon;
