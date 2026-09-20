-- Merging a duplicate catalogue entry into the one that is being kept.
--
-- The catalogue is shared, so a duplicate is everyone's: two entries for one
-- casting split its owners in half, and neither entry is wrong enough to
-- delete on its own. Merging moves the cars off the losing entries and then
-- removes them.
--
-- Only the rows that actually point at a losing entry are touched. Nobody
-- else's collection changes, and the cars that move keep their price, seller,
-- dates, condition and photographs — what changes is which casting they say
-- they are. The BEFORE UPDATE trigger tesoro_raw_apply_catalog then rewrites
-- their description from the surviving entry, which is the point of the merge.
--
-- Admin only, both of them, because the catalogue is shared and this rewrites
-- other people's rows.

-- What a merge would touch, so it can be read before it is done.
create or replace function public.catalog_merge_preview(_drop_ids text[])
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  ids text[];
begin
  if not public.is_tesoro_admin((select auth.uid())) then
    raise exception 'Only an admin can read a catalogue merge'
      using errcode = 'insufficient_privilege';
  end if;

  select array_agg(distinct upper(btrim(x))) into ids
  from unnest(coalesce(_drop_ids, '{}'::text[])) as x
  where coalesce(btrim(x), '') <> '';

  if ids is null then
    return jsonb_build_object('cars', 0, 'owners', '[]'::jsonb, 'packs', 0);
  end if;

  return jsonb_build_object(
    'cars', (
      select count(*) from public.tesoro_raw
      where upper(btrim("Catalog ID")) = any(ids)
    ),
    -- Who holds them, so an admin can see whose collection is about to be
    -- rewritten before agreeing to rewrite it.
    'owners', coalesce((
      select jsonb_agg(o order by o->>'cars' desc)
      from (
        select jsonb_build_object('user_id', user_id, 'cars', count(*)) as o
        from public.tesoro_raw
        where upper(btrim("Catalog ID")) = any(ids)
        group by user_id
      ) s
    ), '[]'::jsonb),
    'packs', (
      select count(*) from public.tesoro_catalog_pack_members
      where upper(btrim(pack_car_id)) = any(ids)
         or upper(btrim(member_car_id)) = any(ids)
    )
  );
end;
$$;

create or replace function public.merge_catalog_entries(_keep_id text, _drop_ids text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  keep text := upper(btrim(coalesce(_keep_id, '')));
  ids text[];
  moved_cars integer := 0;
  moved_members integer := 0;
  moved_packs integer := 0;
  removed integer := 0;
begin
  if not public.is_tesoro_admin((select auth.uid())) then
    raise exception 'Only an admin can merge catalogue entries'
      using errcode = 'insufficient_privilege';
  end if;

  if keep = '' then
    raise exception 'Nothing to merge into';
  end if;

  if not exists (select 1 from public.tesoro_car_catalog where upper(car_id) = keep) then
    raise exception 'The entry being kept is not in the catalogue: %', _keep_id;
  end if;

  -- The keeper can never be among the losers, however the caller spelled it.
  select array_agg(distinct upper(btrim(x))) into ids
  from unnest(coalesce(_drop_ids, '{}'::text[])) as x
  where coalesce(btrim(x), '') <> '' and upper(btrim(x)) <> keep;

  if ids is null then
    return jsonb_build_object('merged', 0, 'cars', 0, 'members', 0, 'packs', 0);
  end if;

  -- The cars. Only rows pointing at a losing entry, and their own purchase
  -- details are not read, let alone written.
  update public.tesoro_raw
  set "Catalog ID" = (select car_id from public.tesoro_car_catalog where upper(car_id) = keep)
  where upper(btrim("Catalog ID")) = any(ids);
  get diagnostics moved_cars = row_count;

  -- Box contents. A losing entry may be inside a box, or be one. Repointing
  -- can collide with a row that is already there, so the collisions go first
  -- — a box does not hold the same casting twice.
  delete from public.tesoro_catalog_pack_members m
  where upper(btrim(m.member_car_id)) = any(ids)
    and exists (
      select 1 from public.tesoro_catalog_pack_members k
      where k.pack_car_id = m.pack_car_id and upper(k.member_car_id) = keep
    );

  update public.tesoro_catalog_pack_members
  set member_car_id = (select car_id from public.tesoro_car_catalog where upper(car_id) = keep)
  where upper(btrim(member_car_id)) = any(ids);
  get diagnostics moved_members = row_count;

  delete from public.tesoro_catalog_pack_members m
  where upper(btrim(m.pack_car_id)) = any(ids)
    and exists (
      select 1 from public.tesoro_catalog_pack_members k
      where upper(k.pack_car_id) = keep and k.member_car_id = m.member_car_id
    );

  update public.tesoro_catalog_pack_members
  set pack_car_id = (select car_id from public.tesoro_car_catalog where upper(car_id) = keep)
  where upper(btrim(pack_car_id)) = any(ids);
  get diagnostics moved_packs = row_count;

  delete from public.tesoro_car_catalog where upper(car_id) = any(ids);
  get diagnostics removed = row_count;

  return jsonb_build_object(
    'merged', removed,
    'cars', moved_cars,
    'members', moved_members,
    'packs', moved_packs
  );
end;
$$;

revoke all on function public.catalog_merge_preview(text[]) from public;
revoke all on function public.merge_catalog_entries(text, text[]) from public;
grant execute on function public.catalog_merge_preview(text[]) to authenticated;
grant execute on function public.merge_catalog_entries(text, text[]) to authenticated;
