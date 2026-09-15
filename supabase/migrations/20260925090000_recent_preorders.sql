-- Pre-orders placed recently by anyone, for the Home page's "Recently
-- pre-ordered" shelf.
--
-- Same rules as search_catalogue: SECURITY DEFINER to see every account's cars,
-- approved callers only, and only what a car *is* — never who ordered it, what
-- they paid, the seller, or their own photographs. Identical castings collapse
-- to one row.

-- Order dates are text from the sheet import: ISO or day-first. A value that
-- is not a real calendar date (31/02/2026) is NULL rather than an error.
CREATE OR REPLACE FUNCTION public.tesoro_parse_day(_value text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text := trim(coalesce(_value, ''));
  m text[];
BEGIN
  m := regexp_match(v, '^(\d{4})[/-](\d{1,2})[/-](\d{1,2})');
  IF m IS NOT NULL THEN
    RETURN make_date(m[1]::int, m[2]::int, m[3]::int);
  END IF;
  m := regexp_match(v, '^(\d{1,2})[/-](\d{1,2})[/-](\d{4})');
  IF m IS NOT NULL THEN
    RETURN make_date(m[3]::int, m[2]::int, m[1]::int);
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.recent_preorders(days integer DEFAULT 3, lim integer DEFAULT 24)
RETURNS TABLE (
  make text,
  model text,
  variant text,
  year text,
  colour text,
  type text,
  brand text,
  assortment text,
  series text,
  sub_series text,
  car_number text,
  size text,
  rarity text,
  mrp numeric,
  image_url text,
  copies bigint,
  last_ordered date,
  in_my_collection boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH window_start AS (
    SELECT current_date - (least(greatest(coalesce(days, 3), 1), 14) - 1) AS d
  ),
  cars AS (
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
      public.tesoro_parse_day(r."O_Date") AS ordered
    FROM public.tesoro_raw r
    WHERE lower(trim(r."Status")) IN ('pre order', 'preorder', 'pre-order')
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
  FROM cars c, window_start w
  WHERE public.is_tesoro_approved(auth.uid())
    AND c.ordered BETWEEN w.d AND current_date
    AND (c.make IS NOT NULL OR c.model IS NOT NULL)
  GROUP BY c.make, c.model, c.variant, c.year, c.colour, c.type, c.brand, c.assortment,
    c.series, c.sub_series, c.car_number, c.size
  ORDER BY max(c.ordered) DESC, count(*) DESC, c.make, c.model
  LIMIT least(greatest(coalesce(lim, 24), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.tesoro_parse_day(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tesoro_parse_day(text) TO authenticated;
REVOKE ALL ON FUNCTION public.recent_preorders(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recent_preorders(integer, integer) TO authenticated;
