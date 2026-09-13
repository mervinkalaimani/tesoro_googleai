-- Search every account's cars for the Add a car search box.
--
-- Returns what a car *is* — make, model, colour, series and so on — and never
-- what anyone paid, who sold it, when, or their own photographs. Identical
-- castings across accounts collapse to one row, most-owned first.
--
-- SECURITY DEFINER so it can see past the per-owner row policies, which is the
-- point; in exchange it checks the caller is an approved account itself, and is
-- executable by signed-in users only.

CREATE OR REPLACE FUNCTION public.search_catalogue(q text, lim integer DEFAULT 8)
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
  copies bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH words AS (
    SELECT w
    FROM unnest(regexp_split_to_array(lower(trim(coalesce(q, ''))), '\s+')) AS w
    WHERE w <> ''
    LIMIT 8
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
      -- Only links to images hosted elsewhere (the wikis). A photo uploaded
      -- to our storage is of someone's own car, on their own shelf.
      CASE
        WHEN r."Image URL" ~* '^https?://' AND r."Image URL" !~* '/storage/v1/object/'
        THEN r."Image URL"
      END AS image_url,
      lower(concat_ws(' ', r."Name", r."Make", r."Model", r."Variant", r."Year"::text, r."Brand",
        r."Assortment", r."Series", r."Sub Series", r."Colour", r."Car Number")) AS hay
    FROM public.tesoro_raw r
  )
  SELECT
    c.make, c.model, c.variant, c.year, c.colour, c.type, c.brand, c.assortment,
    c.series, c.sub_series, c.car_number, c.size,
    mode() WITHIN GROUP (ORDER BY c.rarity) AS rarity,
    max(c.mrp) AS mrp,
    max(c.image_url) AS image_url,
    count(*) AS copies
  FROM cars c
  WHERE public.is_tesoro_approved(auth.uid())
    AND EXISTS (SELECT 1 FROM words)
    AND NOT EXISTS (SELECT 1 FROM words WHERE position(words.w IN c.hay) = 0)
    AND (c.make IS NOT NULL OR c.model IS NOT NULL)
  GROUP BY c.make, c.model, c.variant, c.year, c.colour, c.type, c.brand, c.assortment,
    c.series, c.sub_series, c.car_number, c.size
  ORDER BY count(*) DESC, c.make, c.model
  LIMIT least(greatest(coalesce(lim, 8), 1), 25);
$$;

REVOKE ALL ON FUNCTION public.search_catalogue(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_catalogue(text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_catalogue(text, integer) TO authenticated;
