import type { CatalogCar } from "@/lib/catalog";

/**
 * What a new collector said they like, so the first screen can be about them.
 *
 * Kept on the device, per account. It only steers what the welcome wizard
 * suggests; nothing else reads it, and losing it costs one tap on two lists.
 */
export type Taste = { brands: string[]; makes: string[] };

export const EMPTY_TASTE: Taste = { brands: [], makes: [] };

const keyFor = (id: string | number) => `dg.taste.${id}`;

export function loadTaste(id: string | number): Taste {
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(id)) || "null");
    const list = (v: unknown) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    return raw ? { brands: list(raw.brands), makes: list(raw.makes) } : EMPTY_TASTE;
  } catch {
    return EMPTY_TASTE;
  }
}

export function saveTaste(id: string | number, taste: Taste) {
  try {
    localStorage.setItem(keyFor(id), JSON.stringify(taste));
  } catch {
    // Private mode or a full disk: the choice lasts until the wizard closes.
  }
}

const norm = (v: string | null | undefined) => (v || "").trim().toLowerCase();

/**
 * The most common values first, one per spelling. Blanks and "NA" are noise,
 * and the first spelling met is the one shown.
 */
export function topValues(values: (string | null | undefined)[], limit: number): string[] {
  const seen = new Map<string, { label: string; n: number }>();
  for (const v of values) {
    const label = (v || "").trim();
    const k = norm(label);
    if (!k || k === "na" || k === "n/a") continue;
    const hit = seen.get(k);
    if (hit) hit.n += 1;
    else seen.set(k, { label, n: 1 });
  }
  return [...seen.values()]
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((x) => x.label);
}

/** Whether a casting is by a brand or make they picked. Nothing picked matches nothing. */
export function matchesTaste(c: Pick<CatalogCar, "brand" | "make">, taste: Taste): boolean {
  const brands = new Set(taste.brands.map(norm));
  const makes = new Set(taste.makes.map(norm));
  return brands.has(norm(c.brand)) || makes.has(norm(c.make));
}

/** Newest first by the day it was filed; entries with no date go last. */
export function newestFirst<T extends { created_at?: string }>(rows: T[]): T[] {
  const t = (r: T) => (r.created_at ? Date.parse(r.created_at) || 0 : 0);
  return [...rows].sort((a, b) => t(b) - t(a));
}

/**
 * The order the welcome wizard offers castings in, to find the ones somebody
 * already owns. Their brands and makes first, and within each group the ones
 * with a photo first: a car is recognised by its picture, not its name. After
 * those, the rest of the catalogue that has a photo, so a narrow taste does not
 * run out after one set. Nothing they already own.
 */
export function ownedCandidates<
  T extends Pick<CatalogCar, "car_id" | "brand" | "make" | "image_url" | "created_at">,
>(castings: T[], taste: Taste, owned: Set<string>): T[] {
  const fresh = newestFirst(castings).filter((c) => !owned.has(c.car_id.trim().toUpperCase()));
  const photo = (c: T) => Boolean(c.image_url);
  const liked = fresh.filter((c) => matchesTaste(c, taste));
  const rest = fresh.filter((c) => !matchesTaste(c, taste) && photo(c));
  return [...liked.filter(photo), ...liked.filter((c) => !photo(c)), ...rest];
}
