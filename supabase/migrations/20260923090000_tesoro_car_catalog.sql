-- -----------------------------------------------------------------------------
-- Tesoro Car Catalog Framework
-- Centralizes all unique car specifications into public.tesoro_car_catalog so
-- that casting definitions (brand, make, model, assortment, series, sub series,
-- car number, MRP) are never duplicated. The inventory table (tesoro_raw)
-- stores each collected instance linked by its unique Car ID.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tesoro_car_catalog (
  car_id TEXT PRIMARY KEY,
  brand TEXT NOT NULL DEFAULT '',
  make TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  assortment TEXT NOT NULL DEFAULT '',
  series TEXT NOT NULL DEFAULT '',
  sub_series TEXT NOT NULL DEFAULT '',
  car_number TEXT NOT NULL DEFAULT '',
  mrp NUMERIC NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT '',
  variant TEXT NOT NULL DEFAULT '',
  year TEXT,
  colour TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '1:64',
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Fast indexes for searching and filtering the catalog
CREATE INDEX IF NOT EXISTS tesoro_car_catalog_brand_idx ON public.tesoro_car_catalog (brand);
CREATE INDEX IF NOT EXISTS tesoro_car_catalog_make_model_idx ON public.tesoro_car_catalog (make, model);
CREATE INDEX IF NOT EXISTS tesoro_car_catalog_series_idx ON public.tesoro_car_catalog (series);
CREATE INDEX IF NOT EXISTS tesoro_car_catalog_assortment_idx ON public.tesoro_car_catalog (assortment);

-- Enable Row Level Security (RLS)
ALTER TABLE public.tesoro_car_catalog ENABLE ROW LEVEL SECURITY;

-- Approved users and public can view the catalog
DROP POLICY IF EXISTS "Anyone can view car catalog" ON public.tesoro_car_catalog;
CREATE POLICY "Anyone can view car catalog"
  ON public.tesoro_car_catalog
  FOR SELECT
  USING (true);

-- Authenticated users can insert into the catalog
DROP POLICY IF EXISTS "Authenticated users can insert into car catalog" ON public.tesoro_car_catalog;
CREATE POLICY "Authenticated users can insert into car catalog"
  ON public.tesoro_car_catalog
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update car catalog entries
DROP POLICY IF EXISTS "Authenticated users can update car catalog" ON public.tesoro_car_catalog;
CREATE POLICY "Authenticated users can update car catalog"
  ON public.tesoro_car_catalog
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Grant appropriate permissions
GRANT SELECT ON public.tesoro_car_catalog TO anon;
GRANT SELECT, INSERT, UPDATE ON public.tesoro_car_catalog TO authenticated;

-- Helper function to generate catalog car ID in SQL
CREATE OR REPLACE FUNCTION public.fn_generate_catalog_car_id(
  p_brand TEXT,
  p_make TEXT,
  p_model TEXT,
  p_assortment TEXT,
  p_series TEXT,
  p_sub_series TEXT,
  p_car_number TEXT,
  p_mrp NUMERIC
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_brand TEXT;
  v_make TEXT;
  v_model TEXT;
  v_asst TEXT;
  v_series TEXT;
  v_sub TEXT;
  v_num TEXT;
  v_mrp TEXT;
BEGIN
  -- Standardize brand token
  v_brand := UPPER(TRIM(COALESCE(p_brand, '')));
  v_brand := CASE
    WHEN v_brand IN ('HOT WHEELS', 'HOTWHEELS') THEN 'HW'
    WHEN v_brand = 'MATCHBOX' THEN 'MBX'
    WHEN v_brand IN ('MINI GT', 'MINIGT') THEN 'MGT'
    WHEN v_brand = 'KAIDO HOUSE' THEN 'KH'
    WHEN v_brand IN ('INNO64', 'INNO 64') THEN 'INNO'
    WHEN v_brand IN ('POP RACE', 'POPRACE') THEN 'POPR'
    WHEN v_brand = 'TOMICA' THEN 'TOM'
    WHEN v_brand = 'MAJORETTE' THEN 'MAJ'
    WHEN v_brand = 'GREENLIGHT' THEN 'GL'
    WHEN v_brand = 'TARMAC WORKS' THEN 'TW'
    WHEN v_brand = 'DISNEY' THEN 'DIS'
    WHEN v_brand = 'MAISTO' THEN 'MAI'
    WHEN v_brand = 'BBURAGO' THEN 'BBUR'
    WHEN v_brand = 'TAKARA TOMY' THEN 'TOMY'
    ELSE SUBSTRING(REGEXP_REPLACE(v_brand, '[^A-Z0-9]', '', 'g') FROM 1 FOR 6)
  END;
  IF v_brand = '' OR v_brand IS NULL THEN v_brand := 'GEN'; END IF;

  -- Standardize assortment token
  v_asst := UPPER(TRIM(COALESCE(p_assortment, '')));
  v_asst := CASE
    WHEN v_asst = 'MAINLINE' THEN 'MNL'
    WHEN v_asst = 'PREMIUM' THEN 'PRM'
    WHEN v_asst = 'BASIC' THEN 'BSC'
    WHEN v_asst = 'CAR CULTURE' THEN 'CC'
    WHEN v_asst = 'BOULEVARD' THEN 'BLVD'
    WHEN v_asst = 'BOX' THEN 'BOX'
    ELSE SUBSTRING(REGEXP_REPLACE(v_asst, '[^A-Z0-9]', '', 'g') FROM 1 FOR 6)
  END;
  IF v_asst = '' OR v_asst IS NULL THEN v_asst := 'STD'; END IF;

  -- Sanitize tokens
  v_make := COALESCE(NULLIF(SUBSTRING(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(TRIM(COALESCE(p_make, ''))), '[/]', '-', 'g'), '[^A-Z0-9-]', '', 'g') FROM 1 FOR 12), ''), 'GEN');
  v_model := COALESCE(NULLIF(SUBSTRING(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(TRIM(COALESCE(p_model, ''))), '[/]', '-', 'g'), '[^A-Z0-9-]', '', 'g') FROM 1 FOR 16), ''), 'CAR');
  v_series := COALESCE(NULLIF(SUBSTRING(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(TRIM(COALESCE(p_series, ''))), '[/]', '-', 'g'), '[^A-Z0-9-]', '', 'g') FROM 1 FOR 14), ''), 'STD');
  v_sub := COALESCE(NULLIF(SUBSTRING(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(TRIM(COALESCE(p_sub_series, ''))), '[/]', '-', 'g'), '[^A-Z0-9-]', '', 'g') FROM 1 FOR 12), ''), 'NA');
  v_num := COALESCE(NULLIF(SUBSTRING(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(TRIM(COALESCE(p_car_number, ''))), '[/]', '-', 'g'), '[^A-Z0-9-]', '', 'g') FROM 1 FOR 12), ''), 'NA');
  v_mrp := 'M' || ROUND(COALESCE(p_mrp, 0))::TEXT;

  RETURN v_brand || '-' || v_make || '-' || v_model || '-' || v_asst || '-' || v_series || '-' || v_sub || '-' || v_num || '-' || v_mrp;
END;
$$;

-- Seed tesoro_car_catalog from existing distinct cars in tesoro_raw if available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tesoro_raw') THEN
    INSERT INTO public.tesoro_car_catalog (
      car_id, brand, make, model, assortment, series, sub_series, car_number, mrp,
      name, variant, year, colour, type, size, image_url
    )
    SELECT DISTINCT ON (public.fn_generate_catalog_car_id(
      COALESCE(r."Brand", ''),
      COALESCE(r."Make", ''),
      COALESCE(r."Model", ''),
      COALESCE(r."Assortment", ''),
      COALESCE(r."Series", ''),
      COALESCE(r."Sub Series", ''),
      COALESCE(r."Car Number", ''),
      COALESCE(r."MRP", 0)
    ))
      public.fn_generate_catalog_car_id(
        COALESCE(r."Brand", ''),
        COALESCE(r."Make", ''),
        COALESCE(r."Model", ''),
        COALESCE(r."Assortment", ''),
        COALESCE(r."Series", ''),
        COALESCE(r."Sub Series", ''),
        COALESCE(r."Car Number", ''),
        COALESCE(r."MRP", 0)
      ) AS car_id,
      COALESCE(r."Brand", '') AS brand,
      COALESCE(r."Make", '') AS make,
      COALESCE(r."Model", '') AS model,
      COALESCE(r."Assortment", '') AS assortment,
      COALESCE(r."Series", '') AS series,
      COALESCE(r."Sub Series", '') AS sub_series,
      COALESCE(r."Car Number", '') AS car_number,
      COALESCE(r."MRP", 0) AS mrp,
      COALESCE(r."Name", '') AS name,
      COALESCE(r."Variant", '') AS variant,
      r."Year"::TEXT AS year,
      COALESCE(r."Colour", '') AS colour,
      COALESCE(r."Type", '') AS type,
      COALESCE(r."Size", '1:64') AS size,
      COALESCE(r."Image URL", r.image_url) AS image_url
    FROM public.tesoro_raw r
    WHERE COALESCE(r."Make", '') <> '' OR COALESCE(r."Model", '') <> ''
    ON CONFLICT (car_id) DO NOTHING;
  END IF;
END;
$$;
