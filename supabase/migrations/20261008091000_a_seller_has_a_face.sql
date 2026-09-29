-- A shop has a sign over the door. The Sellers page draws initials in a circle
-- where a logo would say it faster, so one may be uploaded or linked.
alter table public.tesoro_sellers
  add column if not exists image_url text;

comment on column public.tesoro_sellers.image_url is
  'Logo or shopfront. Uploaded to the car-photos bucket, or a link to somebody else''s.';
