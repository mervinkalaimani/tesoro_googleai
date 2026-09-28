-- A casting somebody already owns is not still coming.
--
-- tesoro_raw_release_on_status flips a catalogue entry from Pre Order to
-- Released when a car *crosses* out of PO, and it fires AFTER UPDATE OF
-- "Status". That covers a pre-order you placed here and later received. It does
-- not cover the other way a car arrives: added, or imported, already In Hand.
-- No update ever happens, so nothing ever fires, and the entry keeps saying
-- Pre Order with a release date months in the past.
--
-- Three Mini GTs from the September import read that way -- Honda RBPTH002,
-- BMW Z3, Toyota 2000GT: all In Hand since 25 September, all listed on the
-- release calendar as due on the 30th. 11 catalogue entries are in this state.
--
-- So the same rule on the way in, and a backfill for the rows that arrived
-- before it existed.

create or replace function public.tesoro_raw_release_on_arrival()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  status text;
begin
  if coalesce(new."Catalog ID", '') = '' then
    return null;
  end if;

  status := public.tesoro_norm_status(new."Status");

  -- A pre-order is still waiting and an ISO row is a want, not a copy. Anything
  -- else means somebody has one, which is what "released" means.
  if status in ('PO', 'ISO', '') then
    return null;
  end if;

  -- `and release_status = 'Pre Order'` keeps released_at honest, the same way
  -- the update trigger does: the second owner to file one changes nothing.
  update public.tesoro_car_catalog
     set release_status = 'Released',
         released_at    = now(),
         updated_at     = now()
   where car_id = new."Catalog ID"
     and release_status = 'Pre Order';

  return null;
end;
$function$;

comment on function public.tesoro_raw_release_on_arrival() is
  'Releases a casting when a copy is filed that is not a pre-order. The companion to tesoro_raw_release_on_status, for cars that never passed through PO at all.';

drop trigger if exists tesoro_raw_release_on_arrival on public.tesoro_raw;
create trigger tesoro_raw_release_on_arrival
  after insert on public.tesoro_raw
  for each row
  execute function public.tesoro_raw_release_on_arrival();

-- The rows that arrived before the rule did. released_at is left null rather
-- than stamped now(): these were released at some point nobody recorded, and a
-- timestamp saying "today" would put them in "recently released" for a month.
update public.tesoro_car_catalog c
   set release_status = 'Released',
       updated_at = now()
 where c.release_status = 'Pre Order'
   and exists (
     select 1 from public.tesoro_raw r
     where upper(trim(r."Catalog ID")) = upper(c.car_id)
       and public.tesoro_norm_status(r."Status") not in ('PO', 'ISO', '')
   );
