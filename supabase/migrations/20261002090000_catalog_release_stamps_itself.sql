-- A casting released by hand is released.
--
-- released_at had exactly one writer: the trigger on tesoro_raw, which fires
-- when somebody's own copy moves off PO. An admin switching an entry from Pre
-- Order to Released in the catalogue form set the status and nothing else, so
-- the entry never carried a date -- and Recently Released skips anything
-- without one, on purpose: a status alone cannot say when.
--
-- So the shelf stayed empty for a casting the catalogue said was out.
--
-- The catalogue now stamps itself on the same crossing the other trigger
-- watches. Moving back to Pre Order clears the date again, because a released
-- date on an entry that says Pre Order is a contradiction one of them has to
-- lose, and the status is the one somebody just set on purpose.
--
-- An explicit released_at in the same update is kept as typed: a correction
-- that says "this came out on the 12th" is better information than now().
--
-- Only on update, and deliberately. A casting filed straight into the catalogue
-- as Released is a catalogue entry somebody got round to adding, not a release
-- that happened today, so it carries no date and stays off the shelf. Nothing
-- in the app writes released_at itself, so that is the whole of it: the date
-- exists only where a Pre Order became a Released.

create or replace function public.tesoro_catalog_release_stamp()
returns trigger
language plpgsql
as $function$
begin
  if new.release_status = 'Released' then
    new.released_at := coalesce(new.released_at, now());
  elsif new.release_status = 'Pre Order' then
    new.released_at := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists tesoro_catalog_release_stamp on public.tesoro_car_catalog;

create trigger tesoro_catalog_release_stamp
before update of release_status on public.tesoro_car_catalog
for each row
when (old.release_status is distinct from new.release_status)
execute function public.tesoro_catalog_release_stamp();

-- The three entries switched to Released today before the trigger existed, dated
-- from the edit that switched them. Scoped to today on purpose: 1,359 older
-- entries also say Released with no date, and dating those now would put every
-- one of them on the shelf as though it came out this morning.
update public.tesoro_car_catalog
   set released_at = updated_at
 where release_status = 'Released'
   and released_at is null
   and updated_at >= date '2026-09-26';
