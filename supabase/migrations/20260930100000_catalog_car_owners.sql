-- ---------------------------------------------------------------------------
-- Admin Provenance Tracking: Users who added a catalog car
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.catalog_car_owners(_car_id text)
RETURNS TABLE (
  auth_uid      uuid,
  user_id       text,
  first_name    text,
  last_name     text,
  date_added    text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_tesoro_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can view car owners'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH matching_cars AS (
    SELECT
      r.user_id AS owner_uid,
      COALESCE(
        NULLIF(btrim(r."Date"::text), ''),
        NULLIF(btrim(r."O_Date"::text), ''),
        ''
      ) AS eff_date
    FROM public.tesoro_raw r
    WHERE upper(btrim(r."Catalog ID")) = upper(btrim(_car_id))
       OR upper(btrim(r."Car ID")) = upper(btrim(_car_id))
  ),
  aggregated_users AS (
    SELECT
      m.owner_uid,
      MAX(m.eff_date) AS latest_date
    FROM matching_cars m
    GROUP BY m.owner_uid
  )
  SELECT
    u.auth_uid,
    COALESCE(u.user_id, '') AS user_id,
    COALESCE(u.first_name, '') AS first_name,
    COALESCE(u.last_name, '') AS last_name,
    COALESCE(NULLIF(a.latest_date, ''), to_char(u.created_at, 'YYYY-MM-DD'), '—') AS date_added
  FROM aggregated_users a
  JOIN public.tesoro_users u ON u.auth_uid = a.owner_uid
  ORDER BY date_added DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_car_owners(text) FROM public;
REVOKE ALL ON FUNCTION public.catalog_car_owners(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.catalog_car_owners(text) TO authenticated;
