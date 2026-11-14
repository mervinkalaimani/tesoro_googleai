-- Indexes for the reads that had none that fit. See each comment for the query.

-- fetchCarsFromSupabase: where user_id = me order by "SNO", paged. The plain
-- user_id index finds the rows but not in order.
create index if not exists tesoro_raw_user_sno_idx
  on public.tesoro_raw (user_id, "SNO");

-- catalog_car_owners compares these exact expressions; the plain btree on the
-- raw column cannot serve them.
create index if not exists tesoro_raw_catalog_id_norm_idx
  on public.tesoro_raw ((upper(btrim("Catalog ID"))));
create index if not exists tesoro_raw_car_id_norm_idx
  on public.tesoro_raw ((upper(btrim("Car ID"))));

-- The full catalogue fetch orders by exactly this, a page at a time.
create index if not exists tesoro_car_catalog_list_order_idx
  on public.tesoro_car_catalog (brand, make, model, car_id);
