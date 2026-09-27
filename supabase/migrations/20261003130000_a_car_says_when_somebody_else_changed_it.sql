-- A car remembers that somebody else changed it.
--
-- An admin correcting a catalogue entry rewrites the brand, make, model,
-- variant, colour, type, assortment, series, sub series, car number, size and
-- year of every car filed under that casting. That is the point of the
-- catalogue and it is usually a favour -- but it happens silently, in somebody
-- else's collection, and the owner has no way to know their row moved.
--
-- So the propagation stamps what it touched: when, and who. The dot in the
-- collection reads the pair against owner_seen_at.
--
-- Only the propagation stamps. A car edited by its owner is not a change
-- somebody else made, and the owner's own saves go through PostgREST without
-- passing here at all.
--
-- auth.uid() is null when this runs from a migration, a cron job or the service
-- role, and that is honest: the change was not made by a person. The timestamp
-- still lands, so the owner is still told.

create or replace function public.tesoro_catalog_propagate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.tesoro_raw r set
    "Brand"      = new.brand,
    "Make"       = new.make,
    "Model"      = new.model,
    "Variant"    = new.variant,
    "Colour"     = new.colour,
    "Type"       = new.type,
    "Assortment" = new.assortment,
    "Series"     = new.series,
    "Sub Series" = new.sub_series,
    "Car Number" = new.car_number,
    "Size"       = coalesce(nullif(new.size, ''), r."Size"),
    "Year"       = substring(coalesce(new.year, '') from '\d{2,4}')::numeric,
    "MRP"        = case when r."MRP" is not distinct from round(coalesce(old.mrp, 0))
                        then round(coalesce(new.mrp, 0))
                        else r."MRP" end,
    "Name"       = case when coalesce(r."Name", '') is not distinct from coalesce(old.name, '')
                        then coalesce(nullif(new.name, ''), r."Name")
                        else r."Name" end,
    -- Only for somebody else's car. An admin's own collection does not need
    -- telling what the admin just did.
    admin_changed_at = case when r.user_id is distinct from auth.uid() then now()
                            else r.admin_changed_at end,
    admin_changed_by = case when r.user_id is distinct from auth.uid() then auth.uid()
                            else r.admin_changed_by end
  where r."Catalog ID" = new.car_id;
  return null;
end;
$function$;

-- Opening a car is what clears its dot: the owner has now seen the change.
-- Security definer so it can write a column the owner's own RLS policy has no
-- reason to expose, and scoped to the caller's own rows regardless.
create or replace function public.tesoro_mark_car_seen(_car_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.tesoro_raw
     set owner_seen_at = now()
   where "Car ID" = _car_id
     and user_id = auth.uid()
     and admin_changed_at is not null;
end $function$;

grant execute on function public.tesoro_mark_car_seen(text) to authenticated;
