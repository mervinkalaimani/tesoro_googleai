-- The image had no business in catalog_push_to_collections.
--
-- tesoro_car_catalog.image_url is not reliably per-casting: one Mini GT wiki
-- photo is attached to 63 entries spanning 16 makes (Bentley Mulliner through
-- Volkswagen T1), six Porsche 911 entries share a single 992 GT3 shot, and
-- nine Nissan entries share one R34. Copying that down into collections is how
-- every BMW ended up wearing the same picture.
--
-- An owned row's photo is better data than the catalogue's — it was found per
-- car when the car was added, or taken by the person — so the catalogue must
-- not overwrite it. The descriptive columns and the pre-order expected date
-- still propagate; those the catalogue genuinely owns.
--
-- Supersedes the image handling in 20260923170000.
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

commit;
