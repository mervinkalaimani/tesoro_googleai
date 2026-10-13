-- A colour stops joining the list.
--
-- Two triggers kept `tesoro_car_catalog.colours` topped up: one on the
-- catalogue itself, one on `tesoro_raw` that added a collector's colour to the
-- casting they filed it under. They were built for a model where a casting was
-- one thing that came out in several colours.
--
-- It is not. The red one and the yellow one are two releases, two entries and
-- two IDs -- which is what the copy digit at the end of a catalogue ID is for.
-- The app stopped reading `colours` in build 346.
--
-- What the data says, read before this was written:
--
--   * 1,795 rows in tesoro_raw, every one with a catalogue ID;
--   * cars whose colour differs from their entry's colour: 0;
--   * 32 entries carrying 33 extra colours in `colours`, and not one car
--     behind any of them.
--
-- So there is nothing to split and nothing to re-point. The extras are residue
-- from rows since corrected. Only the triggers go.
--
-- The column stays, and so do both functions: nothing is dropped that cannot
-- be put back with the CREATE TRIGGER statements quoted in the checks below.
-- Removing the column or clearing the arrays would be the one irreversible
-- step here, and inert data costs nothing.

drop trigger if exists tesoro_catalog_colour_joins_the_list on public.tesoro_car_catalog;
drop trigger if exists tesoro_raw_colour_joins_the_casting on public.tesoro_raw;

do $$
begin
  -- 1. Both triggers are gone.
  if exists (
    select 1 from pg_trigger
    where not tgisinternal
      and tgname in (
        'tesoro_catalog_colour_joins_the_list',
        'tesoro_raw_colour_joins_the_casting'
      )
  ) then
    raise exception 'ROLLBACK TEST: a colour-merging trigger is still attached';
  end if;

  -- 2. Both functions survive, so this is one statement away from undone:
  --      CREATE TRIGGER tesoro_catalog_colour_joins_the_list
  --        BEFORE INSERT OR UPDATE OF colour, colours ON public.tesoro_car_catalog
  --        FOR EACH ROW EXECUTE FUNCTION tesoro_catalog_colour_joins_the_list();
  --      CREATE TRIGGER tesoro_raw_colour_joins_the_casting
  --        AFTER INSERT OR UPDATE OF "Colour", "Catalog ID" ON public.tesoro_raw
  --        FOR EACH ROW EXECUTE FUNCTION tesoro_raw_colour_joins_the_casting();
  if (
    select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'tesoro_catalog_colour_joins_the_list',
        'tesoro_raw_colour_joins_the_casting'
      )
  ) <> 2 then
    raise exception 'ROLLBACK TEST: a trigger function went with the trigger';
  end if;

  -- 3. The column is untouched. Nothing reads it; nothing had to lose it.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tesoro_car_catalog'
      and column_name = 'colours'
  ) then
    raise exception 'ROLLBACK TEST: colours was dropped, which this does not do';
  end if;

  -- 4. Still true after the change: no car disagrees with its entry.
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
end $$;
