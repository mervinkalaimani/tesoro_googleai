-- Who last corrected a casting, and the owner's ability to remove one.
--
-- Two separate things, in one migration because they are the same feature: the
-- catalogue grew a provenance line, and it was only ever half of one — it could
-- say who filed an entry but not who last changed it, and nobody at all could
-- remove one, because the table has policies for select, insert and update and
-- none for delete.

-- 1. Who last edited the entry. Nullable, and null on every existing row: the
--    edits that have already happened were not recorded and cannot be invented.
--    ON DELETE SET NULL to match created_by — losing the account must not take
--    the casting with it.
alter table public.tesoro_car_catalog
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

comment on column public.tesoro_car_catalog.updated_by is
  'The account that last edited this entry. Null when it has never been edited.';

-- 2. Removing a casting.
--
-- Through a function rather than a delete policy, and deliberately: tesoro_raw
-- carries its "Catalog ID" as plain text with no foreign key, so a delete the
-- database would happily accept can leave somebody else's car pointing at an
-- entry that no longer exists. The rule is that an entry in use cannot be
-- removed, and a rule the client enforces is a rule anyone can route around —
-- so the check and the delete happen together, here, in one statement.
--
-- SECURITY DEFINER because the count spans every collection, which no single
-- account can read; the owner check is therefore the first thing it does.
create or replace function public.delete_catalog_entry(_car_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  _uses integer;
  _found integer;
begin
  if not public.is_tesoro_owner((select auth.uid())) then
    raise exception 'Only the owner can remove a catalogue entry'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into _uses
  from public.tesoro_raw
  where upper(btrim("Catalog ID")) = upper(btrim(_car_id));

  if _uses > 0 then
    return jsonb_build_object('deleted', false, 'uses', _uses);
  end if;

  delete from public.tesoro_car_catalog
  where upper(btrim(car_id)) = upper(btrim(_car_id));

  get diagnostics _found = row_count;
  return jsonb_build_object('deleted', _found > 0, 'uses', 0);
end;
$function$;

revoke all on function public.delete_catalog_entry(text) from public;
grant execute on function public.delete_catalog_entry(text) to authenticated;

-- How many cars across every collection are linked to an entry, so the confirm
-- can say why it cannot be removed before the owner presses anything. Owner
-- only, for the same reason the delete is: it counts rows nobody else can see.
create or replace function public.catalog_entry_usage(_car_id text)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_tesoro_owner((select auth.uid())) then
    raise exception 'Only the owner can read catalogue usage'
      using errcode = 'insufficient_privilege';
  end if;

  return (
    select count(*)
    from public.tesoro_raw
    where upper(btrim("Catalog ID")) = upper(btrim(_car_id))
  );
end;
$function$;

revoke all on function public.catalog_entry_usage(text) from public;
grant execute on function public.catalog_entry_usage(text) to authenticated;
