-- A catalogue row the maker-site job has checked says so, and says when and
-- where. Both are null for everything else, so "Synced" in the app is simply
-- "synced_at is not null" and nothing needs backfilling.
alter table public.tesoro_car_catalog
  add column if not exists synced_at timestamptz,
  add column if not exists synced_source text;
