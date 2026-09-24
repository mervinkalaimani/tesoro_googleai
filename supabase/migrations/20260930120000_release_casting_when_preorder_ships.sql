-- A casting stops being a pre-order the moment somebody's copy of it arrives.
--
-- Whoever gets theirs first knows something everybody else waiting on that
-- casting wants to know. Until now that knowledge stayed in their collection:
-- the catalogue went on saying "Pre Order" until an admin happened to notice
-- and change it by hand, so everyone else's pre-order sat there looking like it
-- had not shipped.
--
-- This lives in the database rather than the app because catalogue writes are
-- admin-only (see "Admins can update car catalog"). A regular collector moving
-- their own car off PO has every right to do so and no right to edit the shared
-- entry, so the flip runs as the definer instead of as them.

alter table public.tesoro_car_catalog
  add column if not exists released_at timestamptz;

comment on column public.tesoro_car_catalog.released_at is
  'When this casting stopped being a pre-order. Null for entries released before the flip existed, which is why "Recently released" is driven by this column and not by release_status alone.';

create or replace function public.tesoro_raw_release_on_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  -- Case, punctuation and spacing are not part of a status, the same rule
  -- src/lib/status.ts applies. "PO", "Pre Order" and "Pre-Order" are all in the
  -- table today and all mean the same thing.
  was_po boolean;
  now_po boolean;
begin
  if coalesce(new."Catalog ID", '') = '' then
    return null;
  end if;

  was_po := regexp_replace(lower(coalesce(old."Status", '')), '[^a-z]', '', 'g') in ('po', 'preorder');
  now_po := regexp_replace(lower(coalesce(new."Status", '')), '[^a-z]', '', 'g') in ('po', 'preorder');

  -- Only the crossing counts. Moving between two non-PO statuses says nothing
  -- about a release, and moving *into* PO is someone correcting a mistake.
  if not was_po or now_po then
    return null;
  end if;

  -- `and release_status = 'Pre Order'` is what keeps released_at honest: the
  -- second and third owners to receive theirs change nothing, so the timestamp
  -- stays at the first arrival rather than creeping forward for weeks.
  update public.tesoro_car_catalog
     set release_status = 'Released',
         released_at    = now(),
         updated_at     = now()
   where car_id = new."Catalog ID"
     and release_status = 'Pre Order';

  return null;
end;
$function$;

drop trigger if exists tesoro_raw_release_on_status on public.tesoro_raw;

create trigger tesoro_raw_release_on_status
after update of "Status" on public.tesoro_raw
for each row
when (old."Status" is distinct from new."Status")
execute function public.tesoro_raw_release_on_status();
