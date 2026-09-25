-- New Pre Orders keeps to its window.
--
-- recent_preorders has always taken a `days` argument, defaulted to 3, and
-- never used it. So the shelf was never "the last three days" -- it was the
-- newest twenty-four rows by insertion, whatever their dates, and seven of
-- today's twenty-four cards were older than three days, one of them by six
-- months. The window now applies.
--
-- What the window is measured on is O_Date, the day the pre-order was placed.
-- 163 of the 187 pre-order rows read that way. The other 24 carry a date
-- months ahead with "Expected Date" left empty -- the drop it is waiting on,
-- typed into the only date field that was filled in. Those are not news from
-- today, and there is no other record of when they were placed, so a window on
-- when something was ordered cannot vouch for them and they stay off the shelf.
-- The insertion order they used to ride in on is what put them there.
--
-- The cut to `lim` now happens after the window instead of before it, so a full
-- shelf is a full shelf of recent pre-orders rather than whatever the newest
-- twenty-four rows happened to be dated. With three days that is 4 castings
-- today, 8 over a week, 20 over a fortnight -- the shelf is thin because the
-- shelf is honest.
--
-- Nothing else moves: the same rows, the same grouping, the same approval gate.

create or replace function public.recent_preorders(days integer default 3, lim integer default 24)
returns table(
  make text, model text, variant text, year text, colour text, type text,
  brand text, assortment text, series text, sub_series text, car_number text,
  size text, rarity text, mrp numeric, image_url text, copies bigint,
  last_ordered date, in_my_collection boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  WITH cars AS (
    SELECT
      nullif(trim(r."Make"), '')        AS make,
      nullif(trim(r."Model"), '')       AS model,
      nullif(trim(r."Variant"), '')     AS variant,
      nullif(trim(r."Year"::text), '')  AS year,
      nullif(trim(r."Colour"), '')      AS colour,
      nullif(trim(r."Type"), '')        AS type,
      nullif(trim(r."Brand"), '')       AS brand,
      nullif(trim(r."Assortment"), '')  AS assortment,
      nullif(trim(r."Series"), '')      AS series,
      nullif(trim(r."Sub Series"), '')  AS sub_series,
      nullif(trim(r."Car Number"), '')  AS car_number,
      nullif(trim(r."Size"), '')        AS size,
      coalesce(nullif(trim(r."Rarity"), ''), CASE WHEN r."Chase" THEN 'Chase' ELSE 'Normal' END) AS rarity,
      nullif(r."MRP", 0)::numeric       AS mrp,
      CASE
        WHEN r."Image URL" ~* '^https?://' AND r."Image URL" !~* '/storage/v1/object/'
        THEN r."Image URL"
      END AS image_url,
      public.tesoro_parse_day(r."O_Date") AS ordered,
      r."SNO"                            AS sno
    FROM public.tesoro_raw r
    WHERE regexp_replace(lower(trim(r."Status")), '[^a-z]', '', 'g') IN ('preorder', 'po')
  ),
  mine AS (
    SELECT DISTINCT
      lower(concat_ws('|', trim(m."Brand"), trim(m."Make"), trim(m."Model"), trim(m."Variant"),
        trim(m."Colour"), trim(m."Series"))) AS k
    FROM public.tesoro_raw m
    WHERE m.user_id = auth.uid()
  )
  SELECT
    c.make, c.model, c.variant, c.year, c.colour, c.type, c.brand, c.assortment,
    c.series, c.sub_series, c.car_number, c.size,
    mode() WITHIN GROUP (ORDER BY c.rarity) AS rarity,
    max(c.mrp) AS mrp,
    max(c.image_url) AS image_url,
    count(*) AS copies,
    max(c.ordered) AS last_ordered,
    EXISTS (
      SELECT 1 FROM mine
      WHERE mine.k = lower(concat_ws('|', c.brand, c.make, c.model, c.variant, c.colour, c.series))
    ) AS in_my_collection
  FROM cars c
  WHERE public.is_tesoro_approved(auth.uid())
    AND (c.make IS NOT NULL OR c.model IS NOT NULL)
  GROUP BY c.make, c.model, c.variant, c.year, c.colour, c.type, c.brand, c.assortment,
    c.series, c.sub_series, c.car_number, c.size
  -- Ordered in the window and not after today. A date ahead of today is a drop
  -- date rather than the day it was bought, and a row with no readable date at
  -- all cannot be placed in a window either.
  HAVING max(c.ordered)
    BETWEEN current_date - least(greatest(coalesce(days, 3), 1), 60) AND current_date
  ORDER BY max(c.ordered) DESC, max(c.sno) DESC NULLS LAST, count(*) DESC, c.make, c.model
  LIMIT least(greatest(coalesce(lim, 24), 1), 50);
$function$;
