-- "New Pre Orders" on the homepage showed nothing, for two reasons that
-- compounded.
--
-- 1. It matched only the spelled-out forms — 'pre order', 'preorder',
--    'pre-order' — so every row saved as "PO" was invisible. All five
--    pre-orders placed today are "PO". Normalised here the same way
--    src/lib/status.ts does it: strip everything but letters, then compare.
--
-- 2. It windowed on O_Date: `c.ordered BETWEEN current_date - 2 AND
--    current_date`. For a pre-order O_Date is the release you are waiting for,
--    not the day you placed it — the rows in there today read 2026-10-05
--    through 2027-02-20. Every one of those is in the future, so the window
--    excluded essentially the whole list. 167 pre-orders and a shelf that could
--    only ever show the handful whose release happened to land in the last
--    three days.
--
-- tesoro_raw has no created_at, so there is no "when was this row added" to
-- window on instead. SNO is the insertion order and the app already treats it
-- as one (compareCars sorts by it for exactly this reason), so "new" is now the
-- highest SNOs rather than a date range. `lim` does the limiting it was always
-- doing; `days` is kept in the signature so the caller does not change, and is
-- deliberately unused.
--
-- last_ordered still returns max(O_Date) — for a pre-order that is the release
-- date, which is what the card caption wants to say anyway.
begin;

create or replace function public.recent_preorders(days integer default 3, lim integer default 24)
returns table(
  make text, model text, variant text, year text, colour text, type text, brand text,
  assortment text, series text, sub_series text, car_number text, size text, rarity text,
  mrp numeric, image_url text, copies bigint, last_ordered date, in_my_collection boolean
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
  ORDER BY max(c.sno) DESC NULLS LAST, count(*) DESC, c.make, c.model
  LIMIT least(greatest(coalesce(lim, 24), 1), 50);
$function$;

commit;
