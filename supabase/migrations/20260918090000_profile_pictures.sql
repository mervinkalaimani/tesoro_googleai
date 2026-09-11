-- Profile pictures.
--
-- Two halves: somewhere to put the file, and somewhere to record which file is
-- whose. The column is nullable with no default — most accounts will never set
-- one, and the initials drawn from the name are a perfectly good avatar.
--
-- Why a second bucket rather than a folder inside car-photos: what a picture is
-- for decides how long it lives and who may replace it. A car photograph belongs
-- to a row that can be deleted; a profile picture belongs to a person, is read
-- by anyone who can see that person's name, and is replaced far more often. One
-- set of policies cannot mean both things at once.

ALTER TABLE public.tesoro_users
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Readable by anyone, like the car photos and for the same reason: an <img src>
-- that has to be re-signed on a timer is a lot of machinery for a face in a
-- menu. The URL carries a random file name and no account details.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  -- 2 MB. The app downscales to 512px and re-encodes before uploading, so
  -- anything near this ceiling skipped that path.
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Avatars are readable by anyone" ON storage.objects;
CREATE POLICY "Avatars are readable by anyone" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- Every object lives under <auth.uid()>/..., and each policy compares that first
-- path segment with the caller — so nobody can replace anyone else's face.
DROP POLICY IF EXISTS "Users upload their own avatar" ON storage.objects;
CREATE POLICY "Users upload their own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users replace their own avatar" ON storage.objects;
CREATE POLICY "Users replace their own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete their own avatar" ON storage.objects;
CREATE POLICY "Users delete their own avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
