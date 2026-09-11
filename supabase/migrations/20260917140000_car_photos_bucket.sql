-- A place to put photographs of cars.
--
-- Until now the only way to give a car a picture was to paste a link to one
-- somebody else was hosting, which breaks the day they move it. This is a
-- bucket for photographs taken of the actual car on the actual shelf.
--
-- Public-read on purpose. The alternative is signed URLs, which expire, and the
-- image src would then have to be refreshed on a timer for every row in a
-- 1,500-car table. Nothing here is private: they are pictures of toy cars, and
-- the file name carries no account information beyond a random id.
--
-- Writes are restricted to the owner of the folder. Every object lives under
-- <auth.uid()>/..., and the policies compare that first path segment with the
-- caller — so one account can never overwrite or delete another's photographs.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'car-photos',
  'car-photos',
  true,
  -- 5 MB. The app downscales to roughly 1600px and re-encodes before uploading,
  -- so anything arriving near this ceiling is a file that skipped that path.
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Car photos are readable by anyone" ON storage.objects;
CREATE POLICY "Car photos are readable by anyone" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'car-photos');

DROP POLICY IF EXISTS "Users upload their own car photos" ON storage.objects;
CREATE POLICY "Users upload their own car photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'car-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users replace their own car photos" ON storage.objects;
CREATE POLICY "Users replace their own car photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'car-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete their own car photos" ON storage.objects;
CREATE POLICY "Users delete their own car photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'car-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
