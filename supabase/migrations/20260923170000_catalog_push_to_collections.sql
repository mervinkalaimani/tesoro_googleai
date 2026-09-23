-- Pushing a catalogue correction into every collection that holds the casting.
--
-- The tesoro_catalog_propagate trigger already does most of this, but only at
-- the moment an entry is saved, and only for the descriptive columns. Two gaps
-- follow from that:
--
--   * a row added AFTER an entry was corrected never saw the correction, and
--     nothing re-runs the trigger for it;
--   * the trigger never carried the image or the expected date at all, which
--     are the two things most likely to be wrong in somebody else's copy.
--
-- This is the same propagation, on demand, for one entry or for the whole
-- catalogue. SECURITY DEFINER because it writes rows belonging to other
-- people, which RLS rightly forbids — so it is gated on is_tesoro_admin() and
-- checks that gate itself rather than trusting the caller.
--
-- WHAT IT DOES NOT TOUCH, deliberately:
--
--   "Status"      yours, not the catalogue's. Whether a car is In Hand or
--                 Ordered is a fact about your shelf. The catalogue only knows
--                 Released vs Pre Order, and overwriting one with the other
--                 would wipe everybody's collection state.
--   "Spent"       what you paid is not what it costs.
--   Personal photographs. A row whose image lives in Supabase storage is a
--                 picture somebody took of their own car — 64 of them today —
--                 and the catalogue's stock photo must never replace it. Only
--                 a blank image or an external link (the catalogue's own URL,
--                 copied when the car was added and since gone stale) is
--                 refreshed.
--
-- Returns the number of rows changed, so the button can say so.
begin;

create or replace function public.catalog_push_to_collections(_car_id text default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  touched integer := 0;
  target text := nullif(trim(coalesce(_car_id, '')), '');
begin
  if not public.is_tesoro_admin(auth.uid()) then
    raise exception 'Only an admin can push the catalogue into other collections.';
  end if;

  with changed as (
    update public.tesoro_raw r set
      "Brand"      = c.brand,
      "Make"       = c.make,
      "Model"      = c.model,
      "Variant"    = c.variant,
      "Colour"     = c.colour,
      "Type"       = c.type,
      "Assortment" = c.assortment,
      "Series"     = c.series,
      "Sub Series" = c.sub_series,
      "Car Number" = c.car_number,
      "Size"       = coalesce(nullif(c.size, ''), r."Size"),
      "MRP"        = round(coalesce(c.mrp, 0)),
      "Year"       = substring(coalesce(c.year, '') from '\d{2,4}')::numeric,
      "Name"       = coalesce(nullif(c.name, ''), r."Name"),
      -- Only where there is nothing to lose: a blank, or a link that came from
      -- the catalogue in the first place. Never a storage upload.
      "Image URL"  = case
        when coalesce(nullif(trim(c.image_url), ''), '') = '' then r."Image URL"
        when r."Image URL" ilike '%/storage/v1/object/%' then r."Image URL"
        else c.image_url
      end,
      -- Only a car still waiting on a release has an expected date the
      -- catalogue can speak for.
      "Expected Date" = case
        when regexp_replace(lower(trim(coalesce(r."Status", ''))), '[^a-z]', '', 'g')
             in ('preorder', 'po')
         and coalesce(nullif(trim(c.expected_date), ''), '') <> ''
        then c.expected_date
        else r."Expected Date"
      end
    from public.tesoro_car_catalog c
    where trim(r."Catalog ID") = c.car_id
      and (target is null or c.car_id = target)
    returning 1
  )
  select count(*) into touched from changed;

  return touched;
end;
$function$;

revoke all on function public.catalog_push_to_collections(text) from public, anon;
grant execute on function public.catalog_push_to_collections(text) to authenticated;

commit;
