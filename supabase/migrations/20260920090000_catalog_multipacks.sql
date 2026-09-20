-- A catalogue entry that is a box of cars rather than one car.
--
-- Hot Wheels and Matchbox sell 5-packs, 2-packs and Team Transport pairs. Every
-- car inside one is already an ordinary catalogue entry — the five Ferrari
-- castings, both halves of the Back to the Future pair, all six of a Team
-- Transport wave. What was missing is the box: nothing said those entries come
-- in one package, bought once, for one price.
--
-- So a pack is a catalogue entry like any other, flagged, with a list of the
-- entries it contains. You own the box — one row in tesoro_raw pointing at the
-- pack — and the cars inside are read from that list. tesoro_raw needs no
-- change at all; "Ferrari 5 Pack" has been recorded exactly this way by hand
-- since before the feature existed.

alter table public.tesoro_car_catalog
  add column if not exists is_multipack boolean not null default false,
  add column if not exists pack_size smallint;

comment on column public.tesoro_car_catalog.is_multipack is
  'This entry is a box of cars, not a single casting. Its contents are in tesoro_catalog_pack_members.';
comment on column public.tesoro_car_catalog.pack_size is
  'How many cars the box holds, as sold. Kept separately from the member count so a part-filled pack can still say "3 of 5 listed".';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tesoro_car_catalog_pack_size_check'
  ) then
    alter table public.tesoro_car_catalog
      add constraint tesoro_car_catalog_pack_size_check
      check (pack_size is null or pack_size between 2 and 24);
  end if;
end $$;

-- What is in the box.
--
-- ON UPDATE CASCADE on both sides, and that is not decoration: editing a
-- casting's brand, make, model, assortment, series or sub series fires
-- tesoro_catalog_id_follows_edit, which regenerates car_id in place. Without
-- the cascade, correcting a typo in a member's series would silently break its
-- membership. ON DELETE differs by side on purpose — removing a pack takes its
-- membership rows with it, removing a casting that is inside one is refused.
create table if not exists public.tesoro_catalog_pack_members (
  pack_car_id text not null
    references public.tesoro_car_catalog(car_id) on update cascade on delete cascade,
  member_car_id text not null
    references public.tesoro_car_catalog(car_id) on update cascade on delete restrict,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  primary key (pack_car_id, member_car_id)
);

create index if not exists tesoro_catalog_pack_members_member_idx
  on public.tesoro_catalog_pack_members (member_car_id);

comment on table public.tesoro_catalog_pack_members is
  'The castings inside a multipack. One row per car in the box.';

alter table public.tesoro_catalog_pack_members enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.tesoro_catalog_pack_members'::regclass
      and polname = 'Anyone can view pack members'
  ) then
    create policy "Anyone can view pack members"
      on public.tesoro_catalog_pack_members for select using (true);
  end if;

  -- Write access mirrors the catalogue itself: the contents of a box are a fact
  -- about the product, shared by everyone who owns one, so they are an admin's
  -- to state and not something a single collection can change for everybody.
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.tesoro_catalog_pack_members'::regclass
      and polname = 'Admins can change pack members'
  ) then
    create policy "Admins can change pack members"
      on public.tesoro_catalog_pack_members for all
      using ((select public.is_tesoro_admin((select auth.uid()))))
      with check ((select public.is_tesoro_admin((select auth.uid()))));
  end if;
end $$;

-- A box cannot hold itself, and cannot hold another box. Neither is a shape any
-- real product takes, and both turn "what is in this pack" into a graph walk
-- that every reader would have to defend itself against.
create or replace function public.tesoro_pack_member_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _member_is_pack boolean;
begin
  if new.pack_car_id = new.member_car_id then
    raise exception 'A multipack cannot contain itself (%)', new.pack_car_id
      using errcode = 'check_violation';
  end if;

  select is_multipack into _member_is_pack
  from public.tesoro_car_catalog
  where car_id = new.member_car_id;

  if coalesce(_member_is_pack, false) then
    raise exception 'A multipack cannot contain another multipack (%)', new.member_car_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

drop trigger if exists tesoro_pack_member_guard on public.tesoro_catalog_pack_members;
create trigger tesoro_pack_member_guard
  before insert or update on public.tesoro_catalog_pack_members
  for each row execute function public.tesoro_pack_member_guard();

-- Unticking "this is a multipack" empties the box rather than leaving a list
-- nothing reads, which would come back the moment the flag was ticked again.
create or replace function public.tesoro_catalog_pack_cleanup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.is_multipack and not new.is_multipack then
    delete from public.tesoro_catalog_pack_members where pack_car_id = new.car_id;
  end if;
  return null;
end;
$function$;

drop trigger if exists tesoro_catalog_pack_cleanup on public.tesoro_car_catalog;
create trigger tesoro_catalog_pack_cleanup
  after update of is_multipack on public.tesoro_car_catalog
  for each row
  when (old.is_multipack is distinct from new.is_multipack)
  execute function public.tesoro_catalog_pack_cleanup();

-- Removing a casting already refuses when a car is linked to it. A casting that
-- is inside a pack is the same kind of in-use: the pack would be left claiming
-- contents it no longer has. The foreign key above would refuse it anyway; this
-- is so the owner is told why before pressing anything.
create or replace function public.delete_catalog_entry(_car_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  _uses integer;
  _packs integer;
  _found integer;
begin
  if not public.is_tesoro_owner((select auth.uid())) then
    raise exception 'Only the owner can remove a catalogue entry'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into _uses
  from public.tesoro_raw
  where upper(btrim("Catalog ID")) = upper(btrim(_car_id));

  select count(*) into _packs
  from public.tesoro_catalog_pack_members
  where upper(btrim(member_car_id)) = upper(btrim(_car_id));

  if _uses > 0 or _packs > 0 then
    return jsonb_build_object('deleted', false, 'uses', _uses, 'packs', _packs);
  end if;

  delete from public.tesoro_car_catalog
  where upper(btrim(car_id)) = upper(btrim(_car_id));

  get diagnostics _found = row_count;
  return jsonb_build_object('deleted', _found > 0, 'uses', 0, 'packs', 0);
end;
$function$;

revoke all on function public.delete_catalog_entry(text) from public;
grant execute on function public.delete_catalog_entry(text) to authenticated;
