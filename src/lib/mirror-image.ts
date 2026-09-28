/**
 * Keeping a copy of a photograph instead of a link to one.
 *
 * The catalogue's pictures were found on the die-cast wikis and stored as
 * URLs. Behind a login that is a bookmark. On a page a search engine indexes it
 * is somebody else's server paying for our traffic, and a link that breaks the
 * day they reorganise their CDN.
 *
 * The wikis' photographs are CC BY-SA: a copy may be served as long as it says
 * whose it is, which is what `image_source_url` is for. Marketplace listings
 * carry no such licence, so eBay and Amazon links are left exactly as they are
 * and simply never published.
 */

/** Hosts whose files may be copied, because their licence allows it. */
const COPYABLE = [".wikia.nocookie.net", ".wikimedia.org", ".wikipedia.org"];

/** Biggest file worth keeping. A wiki photo is a few hundred kilobytes. */
const MAX_BYTES = 6_000_000;

export const CATALOG_PHOTO_PREFIX = "catalog";

export type MirrorOutcome = { status: "copied"; url: string } | { status: "skipped"; why: string };

/** Already ours: a second copy of a copy helps nobody. */
export function isOurs(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

/** Whether this photo's licence lets us hold a copy. */
export function mayCopy(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return COPYABLE.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Fetch one photograph and put it in our own bucket, then point the catalogue
 * entry at the copy and record where it came from.
 *
 * The client must be able to write the bucket under a prefix no user owns —
 * that is the service-role key, and it is read from the environment by the
 * caller rather than known here.
 */
export async function mirrorImage(
  client: {
    storage: {
      from: (b: string) => {
        upload: (
          path: string,
          body: ArrayBuffer | Uint8Array | Blob,
          opts: { contentType: string; upsert: boolean },
        ) => Promise<{ error: { message: string } | null }>;
        getPublicUrl: (path: string) => { data: { publicUrl: string } };
      };
    };
    from: (t: string) => {
      update: (v: Record<string, unknown>) => {
        eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  },
  carId: string,
  imageUrl: string,
  bucket = "car-photos",
): Promise<MirrorOutcome> {
  const source = (imageUrl || "").trim();
  if (!source) return { status: "skipped", why: "no photo" };
  if (isOurs(source)) return { status: "skipped", why: "already ours" };
  if (!mayCopy(source)) return { status: "skipped", why: "licence unknown" };

  let res: Response;
  try {
    res = await fetch(source, {
      // Wikimedia refuses an anonymous client and says so in the body rather
      // than the status, which looks like a corrupt image later on.
      headers: { "user-agent": "Tesoro/1.0 (diecast catalogue; contact via tesoroapp.vercel.app)" },
      redirect: "follow",
    });
  } catch (err) {
    return { status: "skipped", why: `fetch failed: ${String(err)}` };
  }

  if (!res.ok) return { status: "skipped", why: `http ${res.status}` };

  const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
  const ext = EXTENSIONS[contentType];
  if (!ext) return { status: "skipped", why: `not an image: ${contentType || "unknown"}` };

  const bytes = await res.arrayBuffer();
  if (bytes.byteLength === 0) return { status: "skipped", why: "empty" };
  if (bytes.byteLength > MAX_BYTES) return { status: "skipped", why: "too large" };

  const path = `${CATALOG_PHOTO_PREFIX}/${carId}.${ext}`;
  const { error: upErr } = await client.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: true });
  if (upErr) return { status: "skipped", why: `upload failed: ${upErr.message}` };

  const url = client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  const { error: rowErr } = await client
    .from("tesoro_car_catalog")
    .update({ image_url: url, image_source_url: source, updated_at: new Date().toISOString() })
    .eq("car_id", carId);
  if (rowErr) return { status: "skipped", why: `row failed: ${rowErr.message}` };

  return { status: "copied", url };
}
