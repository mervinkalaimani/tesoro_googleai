-- A brand is a logo before it is a word.
--
-- The catalogue's brand filter was a dropdown of 52 names, which is a list to
-- read when the thing being chosen is something you recognise on sight. The
-- filter is a row of logos now, and a logo has to be stored somewhere.
--
-- Not derived from a car's photograph: that was the stopgap, and a casting is
-- not a brand mark. Uploaded, once, by an admin -- the list is shared by
-- everybody, so it is kept the same way the assortment list is.
--
-- The file itself goes in the existing car-photos bucket, under the uploader's
-- own folder, which the bucket's policies already allow. Only the URL lives
-- here.

create table if not exists public.tesoro_brand_logos (
  -- lower(trim(brand)): the key every lookup uses, because "Hot Wheels" is
  -- spelled three ways across 1,682 cars and they are all one brand.
  brand text primary key,
  -- The spelling to show, where anything shows it. The catalogue prints the
  -- brand off the casting, so this is only a record of what was uploaded for.
  label text not null default '',
  image_url text not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.tesoro_brand_logos is
  'One logo per brand, uploaded in Settings > Advanced > Brand logos. Keyed on the lower-cased brand name.';

alter table public.tesoro_brand_logos enable row level security;

-- Read by everybody, including anon: the public casting pages name a brand, and
-- a logo is the least private thing in the database.
drop policy if exists "brand logos are readable by everyone" on public.tesoro_brand_logos;
create policy "brand logos are readable by everyone"
  on public.tesoro_brand_logos for select using (true);

drop policy if exists "brand logos are written by admins" on public.tesoro_brand_logos;
create policy "brand logos are written by admins"
  on public.tesoro_brand_logos for all
  using (public.is_tesoro_admin(auth.uid()))
  with check (public.is_tesoro_admin(auth.uid()));

-- A logo is usually an SVG, and the bucket did not accept one. Everything else
-- about car-photos is unchanged.
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
 where id = 'car-photos';
