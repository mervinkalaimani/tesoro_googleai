// Best-effort client-side car image lookup via Wikipedia REST summary.
// Cached in localStorage; returns null when nothing usable is found.

const CACHE_KEY = "diecast:car-image-cache:v1";
const NEG = "__none__";

type Cache = Record<string, string>;

function loadCache(): Cache {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveCache(cache: Cache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota */
  }
}

async function wikiSummary(title: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    const src: string | undefined = data?.originalimage?.source || data?.thumbnail?.source;
    return src || null;
  } catch {
    return null;
  }
}

async function wikiSearch(q: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
    q,
  )}&gsrlimit=1&prop=pageimages&piprop=original|thumbnail&pithumbsize=600&format=json&origin=*`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    for (const p of Object.values<{
      original?: { source?: string };
      thumbnail?: { source?: string };
    }>(pages)) {
      const src = p?.original?.source || p?.thumbnail?.source;
      if (src) return src;
    }
    return null;
  } catch {
    return null;
  }
}

export async function findCarImage(
  car:
    | {
        name?: string;
        model?: string;
        variant?: string;
        colour?: string;
        brand?: string;
        make?: string;
      }
    | string,
  brand: string,
  make?: string,
): Promise<string | null> {
  const c = typeof car === "string" ? { name: car } : car;
  const model = (c.model || c.name || "").replace(/\s+/g, " ").trim();
  const variant = (c.variant || "").trim();
  const colour = (c.colour || "").trim();
  const b = (c.brand || brand || "").trim();
  const mk = (c.make || make || "").trim();

  const cache = loadCache();
  const k = `${b.toLowerCase()}|${mk.toLowerCase()}|${model.toLowerCase()}|${variant.toLowerCase()}|${colour.toLowerCase()}`;
  const hit = cache[k];
  if (hit === NEG) return null;
  if (hit) return hit;

  const queries = [
    [mk, model, variant, colour, b].filter(Boolean).join(" "),
    [mk, model, variant, b].filter(Boolean).join(" "),
    [mk, model, variant].filter(Boolean).join(" "),
    [mk, model].filter(Boolean).join(" "),
    model,
  ].filter(Boolean);

  let url: string | null = null;
  for (const q of queries) {
    url = await wikiSummary(q);
    if (url) break;
  }
  if (!url) {
    for (const q of queries) {
      url = await wikiSearch(q);
      if (url) break;
    }
  }

  cache[k] = url || NEG;
  saveCache(cache);
  return url;
}

export function setCachedCarImage(
  car: {
    brand?: string;
    make?: string;
    model?: string;
    variant?: string;
    colour?: string;
    name?: string;
  },
  url: string,
) {
  const model = (car.model || car.name || "").replace(/\s+/g, " ").trim();
  const variant = (car.variant || "").trim();
  const colour = (car.colour || "").trim();
  const b = (car.brand || "").trim();
  const mk = (car.make || "").trim();
  const cache = loadCache();
  const k = `${b.toLowerCase()}|${mk.toLowerCase()}|${model.toLowerCase()}|${variant.toLowerCase()}|${colour.toLowerCase()}`;
  cache[k] = url;
  saveCache(cache);
}
