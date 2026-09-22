-- Eleven statuses become six.
--
--   In Hand     <- Available, Available (In Hand)
--   In Transit  <- Transit, Out for Delivery
--   Ordered     <- Waiting, Delayed
--   On Hold     <- On Hold (unchanged)
--   PO          <- Pre Order, PO
--   ISO         <- ISO, Lost, Wrong Item
--
-- "Delayed" stops being stored. Being late is not a stage of a car's life, it
-- is an Ordered or In Transit car whose expected day has gone by, which the app
-- now derives. All three rows marked Delayed when this was written were in fact
-- expecting a date in the future — that drift is why it could not stay.
--
-- APPLY THIS ONLY AFTER THE NEW FRONTEND IS DEPLOYED.
--   New code reads old values (normaliseStatus maps every old spelling), so
--   deploy-then-migrate is safe in that order and only that order. Old code
--   reading "In Hand" would show a grey unknown pill and its Available filter
--   would find nothing.

begin;

-- Every row about to change, kept whole, following the precedent of
-- tesoro_catalog_mix_backup_20260929. Reversing is one update from this table.
create table if not exists tesoro_status_backup_20260923 as
select "SNO", user_id, "Status", "Notes"
from tesoro_raw;

-- Lost and Wrong Item say something the six cannot. Keep the reason in the
-- notes the row already has rather than adding a column for eleven rows.
update tesoro_raw
set "Notes" = case
      when coalesce(btrim("Notes"), '') = '' then 'Was ' || "Status"
      else btrim("Notes") || ' · Was ' || "Status"
    end
where "Status" in ('Lost', 'Wrong Item');

update tesoro_raw
set "Status" = case lower(btrim("Status"))
      when 'available'           then 'In Hand'
      when 'available (in hand)' then 'In Hand'
      when 'transit'             then 'In Transit'
      when 'transit (in transit)' then 'In Transit'
      when 'out for delivery'    then 'In Transit'
      when 'waiting'             then 'Ordered'
      when 'delayed'             then 'Ordered'
      when 'on hold'             then 'On Hold'
      when 'pre order'           then 'PO'
      when 'preorder'            then 'PO'
      when 'pre-order'           then 'PO'
      when 'po'                  then 'PO'
      when 'iso'                 then 'ISO'
      when 'lost'                then 'ISO'
      when 'wrong item'          then 'ISO'
      else "Status"
    end
where coalesce(btrim("Status"), '') <> '';

-- Nothing may be left outside the six. A row that escapes the mapping above is
-- a status nobody planned for, and committing it would leave the column in a
-- state the app cannot filter.
do $$
declare stragglers text;
begin
  select string_agg(distinct "Status", ', ')
  into stragglers
  from tesoro_raw
  where coalesce(btrim("Status"), '') <> ''
    and "Status" not in ('In Hand', 'In Transit', 'Ordered', 'On Hold', 'PO', 'ISO');

  if stragglers is not null then
    raise exception 'Unmapped status values remain: %', stragglers;
  end if;
end $$;

-- The catalogue keeps its own vocabulary: tesoro_car_catalog.release_status is
-- checked against ('Released', 'Pre Order') and is deliberately untouched. What
-- has to change is the two places that read a *car's* status to decide it —
-- they compare against the literal 'Pre Order', so after the rename every PO
-- car would quietly file its casting as Released.
--
-- Patched in place rather than re-pasted. Several migrations have rewritten
-- these functions, so shipping a full body here would mean shipping a copy that
-- may already have drifted from what is live and silently reverting whatever
-- changed in between. This rewrites only the comparison, and fails loudly if it
-- cannot find it.
do $$
declare
  fn text;
  src text;
  patched text;
  hits int;
begin
  foreach fn in array array['tesoro_remap_legacy_car_id', 'tesoro_raw_apply_catalog'] loop
    select pg_get_functiondef(p.oid) into src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = fn;

    if src is null then
      continue;  -- not every deployment has both
    end if;

    patched := replace(
      src,
      'new."Status" = ''Pre Order''',
      'lower(btrim(coalesce(new."Status", ''''))) in (''po'', ''pre order'', ''preorder'', ''pre-order'')'
    );

    hits := (length(src) - length(replace(src, 'new."Status" = ''Pre Order''', '')))
            / length('new."Status" = ''Pre Order''');

    if hits = 0 then
      raise exception
        'Expected % to compare new."Status" against ''Pre Order''; it does not. Check it by hand.', fn;
    end if;

    execute patched;
    raise notice 'Patched % (% comparisons)', fn, hits;
  end loop;
end $$;

-- recent_preorders matches on the spelled-out forms and would have returned
-- nothing at all once the value became "PO". It was safe under "Pre-Order" by
-- luck; the rename is what exposed it.
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'recent_preorders';

  if src is null then
    return;
  end if;

  if position('''pre order'', ''preorder'', ''pre-order''' in src) = 0 then
    raise exception 'recent_preorders no longer lists the pre-order spellings; check it by hand.';
  end if;

  execute replace(
    src,
    '''pre order'', ''preorder'', ''pre-order''',
    '''po'', ''pre order'', ''preorder'', ''pre-order'''
  );
end $$;

commit;
