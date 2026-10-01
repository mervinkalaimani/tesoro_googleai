-- The case a casting shipped in, on the casting.
--
-- "Case / Mix" already exists on a car (`tesoro_raw."Case Number"`), and that
-- is the right place for it: two people's copies of one casting can come out
-- of different cartons, so the case belongs to the copy.
--
-- It is also a fact about the release. A 2024 L case is which assortment
-- carton Mattel shipped that run in, and it is printed on the box before
-- anybody owns one -- so it is knowable about a casting nobody has yet bought,
-- which is exactly what the catalogue is for.
--
-- Nothing propagates it onto cars. `tesoro_catalog_propagate` copies the
-- fields that name the casting (brand, make, model, series, sub-series) and
-- this is not one of them: a collector's case is theirs to state.

alter table public.tesoro_car_catalog
  add column if not exists case_number text;

comment on column public.tesoro_car_catalog.case_number is
  'Assortment case or mix this casting shipped in, e.g. "2024 L". A fact about the release; a car''s own "Case Number" in tesoro_raw is the carton that copy came out of and is not set from here.';
