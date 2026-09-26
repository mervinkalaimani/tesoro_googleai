-- A casting released long ago is dated when it arrived, not when it was noticed.
--
-- Switching an old casting to Released stamped it with now(), which put a car
-- everybody has owned since June at the top of "Recently Released". That shelf
-- is for what has just come out, so dating a back-fill as today is the one
-- thing that breaks it.
--
-- The collection already knows better. If anybody's copy of that casting has a
-- received date, the earliest of them is the day it reached a collector -- that
-- is the release, whoever gets round to marking it. Only when nothing has
-- arrived yet is now() the honest answer, and that is exactly the case the
-- shelf is for: the first copy landing today.
--
-- Rows still on pre-order carry no received date, so they cannot drag the
-- date backwards to the day somebody ordered it.

create or replace function public.tesoro_catalog_first_owned_day(_car_id text)
returns timestamptz
language sql
stable
security definer
set search_path to 'public'
as $function$
  select min(public.tesoro_parse_day(r."Date"))::timestamptz
  from public.tesoro_raw r
  where upper(trim(coalesce(r."Catalog ID", ''))) = upper(trim(coalesce(_car_id, '')))
    and public.tesoro_parse_day(r."Date") is not null;
$function$;

-- Same trigger as before, with the evidence consulted before the clock.
create or replace function public.tesoro_catalog_release_stamp()
returns trigger
language plpgsql
as $function$
begin
  if new.release_status = 'Released' then
    new.released_at := coalesce(
      new.released_at,
      public.tesoro_catalog_first_owned_day(new.car_id),
      now()
    );
  elsif new.release_status = 'Pre Order' then
    new.released_at := null;
  end if;
  return new;
end;
$function$;

-- Today's back-fill, corrected. Two of the three entries switched to Released
-- this morning have been in collections for months, and were dated as though
-- they came out today. The Hyundai has no arrival on record -- every copy of it
-- is still on pre-order -- so its date stands.
update public.tesoro_car_catalog c
   set released_at = public.tesoro_catalog_first_owned_day(c.car_id)
 where c.release_status = 'Released'
   and c.released_at >= date '2026-09-26'
   and public.tesoro_catalog_first_owned_day(c.car_id) is not null;
