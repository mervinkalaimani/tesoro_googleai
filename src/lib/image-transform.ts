/**
 * Supabase image transformations to reduce storage egress.
 *
 * Full-resolution images from car-photos cost bandwidth on every list and grid.
 * Supabase's transform API resizes on-demand and caches at the edge, so a 1600px
 * photo becomes a 320px thumbnail without re-uploading or storing variants.
 */

export type ImageSize = "thumb" | "card" | "detail" | "full";

const SIZES: Record<ImageSize, number> = {
  thumb: 160, // grid tiles, tiny previews
  card: 320, // list rows, compact cards
  detail: 640, // dialog hero, full card
  full: 1600, // original (already downscaled at upload)
};

/**
 * Add Supabase transform params to an image URL.
 *
 * Only transforms images in our own Supabase storage; external URLs (wikis,
 * marketplaces) are returned unchanged since they can't be transformed.
 */
export function transformImageUrl(
  url: string | null | undefined,
  size: ImageSize = "card",
): string {
  if (!url) return "";

  try {
    const parsed = new URL(url);

    // Only transform our own Supabase images
    if (!parsed.hostname.endsWith(".supabase.co")) return url;
    if (!parsed.pathname.includes("/storage/v1/object/public/")) return url;

    const width = SIZES[size];
    // Add transform params: width, quality, format
    parsed.searchParams.set("width", width.toString());
    parsed.searchParams.set("quality", "85");
    // WebP for better compression, falls back to original format if unsupported
    parsed.searchParams.set("format", "webp");

    return parsed.toString();
  } catch {
    // Invalid URL, return as-is
    return url;
  }
}

/**
 * Preload hint for the largest contentful paint image.
 * Add to <head> for above-the-fold hero images.
 */
export function imageLinkPreload(
  url: string | null | undefined,
  size: ImageSize = "detail",
): string {
  const transformed = transformImageUrl(url, size);
  if (!transformed) return "";
  return `<link rel="preload" as="image" href="${transformed}" />`;
}
