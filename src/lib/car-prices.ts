import type { Diecast } from "@/lib/types";

/**
 * What a brand and assortment usually costs, and who you usually buy from.
 *
 * Both are read out of the collection rather than seeded. A mainline is 179 in
 * this collection and a Mini GT blister is anywhere between 1349 and 1899, and
 * no hand-written table would have known either — but 257 Hotwheels mainlines
 * already in the table do.
 *
 * Neither of these restricts anything. They fill a field in and offer the
 * values worth one tap; anything can still be typed over them.
 */

const NO_SELLER = "No seller";

const groupKey = (brand?: string | null, assortment?: string | null) =>
  `${(brand || "").trim().toLowerCase()}|${(assortment || "").trim().toLowerCase()}`;

/** Values ordered by how often they occur, most used first. */
function byFrequency<T>(values: T[]): T[] {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
    .map(([v]) => v);
}

/**
 * The MRPs recorded against this brand and assortment, most used first.
 *
 * One value means the form can fill it in and say nothing. Several means it
 * cannot guess, so the caller offers them — which is the real difference
 * between a mainline and a Mini GT blister.
 */
export function mrpOptionsFor(
  cars: Diecast[],
  brand?: string | null,
  assortment?: string | null,
  limit = 6,
): number[] {
  if (!(brand || "").trim() || !(assortment || "").trim()) return [];
  const want = groupKey(brand, assortment);
  const seen: number[] = [];
  for (const c of cars) {
    if (groupKey(c.brand, c.assortment) !== want) continue;
    const mrp = typeof c.mrp === "number" ? c.mrp : Number(c.mrp);
    if (Number.isFinite(mrp) && mrp > 0) seen.push(Math.round(mrp));
  }
  return byFrequency(seen).slice(0, limit);
}

/**
 * The sellers this collection buys from most, for one-tap filling.
 *
 * "No seller" is excluded: it is the answer for a gift or a find, always
 * available in the list, and never a shortcut worth a chip of its own.
 */
export function topSellers(cars: Diecast[], limit = 3): string[] {
  const names: string[] = [];
  for (const c of cars) {
    const s = (c.seller || "").trim();
    if (!s || s === NO_SELLER) continue;
    names.push(s);
  }
  const counts = new Map<string, number>();
  for (const n of names) {
    // Counted case-insensitively, but shown the way it is written in the table.
    const k = n.toLowerCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const label = new Map<string, string>();
  for (const n of names) if (!label.has(n.toLowerCase())) label.set(n.toLowerCase(), n);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([k]) => label.get(k) as string);
}
