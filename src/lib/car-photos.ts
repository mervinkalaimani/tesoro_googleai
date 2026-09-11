import { supabase } from "@/integrations/supabase/client";

/**
 * Photographs of cars, in Supabase Storage.
 *
 * Every file lives under `<user id>/<random>.jpg`, which is what the bucket's
 * policies key on: the first path segment has to match the caller, so one
 * account cannot overwrite another's pictures. Reads are public, so the URL can
 * go straight into an `<img src>` and keep working — a signed URL would expire
 * and need refreshing for every row of a 1,500-car table.
 */

export const CAR_PHOTOS_BUCKET = "car-photos";

/**
 * Profile pictures. A second bucket rather than a folder in the first: what a
 * picture is for decides how long it lives and who may replace it, and mixing
 * a person's face in with the shelf makes both harder to reason about.
 */
export const AVATARS_BUCKET = "avatars";

/** What the file picker will accept, and what the bucket allows. */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

/**
 * Longest edge, in pixels, after downscaling.
 *
 * A phone camera produces 4000px, 4MB files. Nothing in this app displays a car
 * larger than a dialog's hero image, so the rest is bandwidth on every page
 * that lists cars. 1600 is generous for a 16:9 frame on a high-DPI screen.
 */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

/** An avatar is never shown larger than a menu, so it is downscaled harder. */
const AVATAR_EDGE = 512;

export type PhotoError = { error: string };
export type PhotoResult = { url: string; path: string };

function isImage(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(file.type);
}

/**
 * Downscale and re-encode to JPEG.
 *
 * Also strips EXIF as a side effect of going through a canvas, which is worth
 * having: phone photographs carry the GPS coordinates of wherever they were
 * taken, and "on my shelf" means someone's home address.
 */
async function normalise(file: File, maxEdge = MAX_EDGE): Promise<Blob> {
  // A browser too old for createImageBitmap uploads the original rather than
  // failing; the bucket's size limit is the backstop.
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;

  let bitmap: ImageBitmap;
  try {
    // imageOrientation so a portrait photo does not arrive on its side once the
    // EXIF rotation flag is dropped along with the rest of the metadata.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  // A PNG of a logo can compress worse as JPEG than it did as PNG; keep
  // whichever is smaller.
  if (!blob) return file;
  return blob.size < file.size ? blob : file;
}

/** Uploads one image to a bucket and returns its public URL. */
async function uploadTo(
  bucket: string,
  file: File,
  maxEdge: number,
): Promise<PhotoResult | PhotoError> {
  if (!isImage(file)) {
    return { error: "That file is not a JPG, PNG or WebP." };
  }

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return { error: "Sign in to upload a photo." };

  const body = await normalise(file, maxEdge);
  const ext = body.type === "image/png" ? "png" : body.type === "image/webp" ? "webp" : "jpg";
  const path = `${uid}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, body, { contentType: body.type || "image/jpeg", upsert: false });

  if (error) {
    // The bucket not existing is the one failure worth naming precisely: it
    // means the migration has not been run, which is a thing the person can fix.
    const msg = /bucket/i.test(error.message)
      ? `The ${bucket} bucket does not exist yet — run the storage migration.`
      : error.message;
    return { error: msg };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export function uploadCarPhoto(file: File): Promise<PhotoResult | PhotoError> {
  return uploadTo(CAR_PHOTOS_BUCKET, file, MAX_EDGE);
}

export function uploadAvatar(file: File): Promise<PhotoResult | PhotoError> {
  return uploadTo(AVATARS_BUCKET, file, AVATAR_EDGE);
}

/** The storage path inside a public URL, or null if it is someone else's link. */
export function pathFromPublicUrl(url: string, bucket = CAR_PHOTOS_BUCKET): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = (url || "").indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

/**
 * Removes a photo we host. A link to someone else's image is not ours to
 * delete, so clearing the field is all that happens in that case.
 */
export async function deleteCarPhoto(url: string): Promise<void> {
  const path = pathFromPublicUrl(url);
  if (!path) return;
  await supabase.storage.from(CAR_PHOTOS_BUCKET).remove([path]);
}

export async function deleteAvatar(url: string): Promise<void> {
  const path = pathFromPublicUrl(url, AVATARS_BUCKET);
  if (!path) return;
  await supabase.storage.from(AVATARS_BUCKET).remove([path]);
}
