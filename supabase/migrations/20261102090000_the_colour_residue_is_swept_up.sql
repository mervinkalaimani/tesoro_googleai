-- The colour residue is swept up.
--
-- `colours` was filled by two triggers dropped in
-- 20261101090000_a_colour_stops_joining_the_list, under a model where one
-- casting came out in several colours. Nothing reads the column now, and the
-- extras in it are not owned by anything: checked at the time, and checked
-- again below, not one car carries a colour its entry is not.
--
-- This leaves each row's list saying exactly what the row's own `colour` says,
-- which is the only true statement the column can now make. Asked for after
-- the triggers went, with the extras shown first.
--
-- This one does delete. There is no undo beyond a point-in-time restore --
-- the extras are not derivable from anything that is left, because no car
-- carries them. That is also why they are safe to go.

update public.tesoro_car_catalog
   set colours = case
                   when btrim(coalesce(colour, '')) = '' then '{}'::text[]
                   else array[btrim(colour)]
                 end
 where colours is distinct from (
         case
           when btrim(coalesce(colour, '')) = '' then '{}'::text[]
           else array[btrim(colour)]
         end
       );

do $$
declare
  stragglers int;
begin
  -- 1. No row's list says anything its own colour does not.
  select count(*) into stragglers
  from public.tesoro_car_catalog c
  where c.colours is not null
    and exists (
      select 1 from unnest(c.colours) x(v)
      where lower(btrim(x.v)) is distinct from lower(btrim(coalesce(c.colour, '')))
    );
  if stragglers <> 0 then
    raise exception 'ROLLBACK TEST: % entries still list a colour they are not', stragglers;
  end if;

  -- 2. No row carries a list longer than the one colour it is.
  if exists (
    select 1 from public.tesoro_car_catalog
    where colours is not null and array_length(colours, 1) > 1
  ) then
    raise exception 'ROLLBACK TEST: an entry still holds more than one colour';
  end if;

  -- 3. An entry with no colour has an empty list rather than ['']. The column
  --    is NOT NULL with a '{}' default, so empty is the shape it wants.
  if exists (
    select 1 from public.tesoro_car_catalog
    where btrim(coalesce(colour, '')) = '' and coalesce(array_length(colours, 1), 0) <> 0
  ) then
    raise exception 'ROLLBACK TEST: a colourless entry kept a list';
  end if;

  -- 4. The thing that made this safe is still true: no car disagrees with its
  --    entry, so nothing lost a colour it was relying on.
  if exists (
    select 1
    from public.tesoro_raw r
    join public.tesoro_car_catalog c on upper(c.car_id) = upper(btrim(r."Catalog ID"))
    where btrim(coalesce(r."Colour", '')) <> ''
      and btrim(coalesce(c.colour, '')) <> ''
      and lower(btrim(r."Colour")) <> lower(btrim(c.colour))
  ) then
    raise exception 'ROLLBACK TEST: a car carries a colour its entry is not';
  end if;

  -- 5. Nothing was deleted but list entries.
  if (select count(*) from public.tesoro_car_catalog) <> 1670 then
    raise exception 'ROLLBACK TEST: the catalogue changed size';
  end if;
end $$;
