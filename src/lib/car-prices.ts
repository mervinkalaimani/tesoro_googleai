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
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
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
 * The sellers this collection spends the most with, for one-tap filling.
 *
 * Ranked by money, not by car count, because those disagree and money is the
 * better answer to "who do I buy from". Rachit Gala sold 100 cars for ₹22k;
 * Ankush KA sold 53 for ₹63k. Counting rows puts the cheap bulk seller above
 * the one the collection is actually built on.
 *
 * "No seller" is excluded: it is the answer for a gift or a find, always
 * available in the list, and never a shortcut worth a chip of its own.
 */
export function topSellers(cars: Diecast[], limit = 3): string[] {
  const spend = new Map<string, number>();
  const label = new Map<string, string>();
  for (const c of cars) {
    const s = (c.seller || "").trim();
    if (!s || s === NO_SELLER) continue;
    // Counted case-insensitively, but shown the way it is written in the table.
    const k = s.toLowerCase();
    if (!label.has(k)) label.set(k, s);
    const paid = typeof c.spent === "number" ? c.spent : Number(c.spent);
    // A row with no price still counts as one purchase from them, so a seller
    // you have used often does not vanish for want of a figure.
    spend.set(k, (spend.get(k) ?? 0) + (Number.isFinite(paid) && paid > 0 ? paid : 0) + 1);
  }
  return [...spend.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([k]) => label.get(k) as string);
}

/**
 * The assortments this brand actually uses, most used first.
 *
 * Hot Wheels has fourteen. A segment control can show four before the labels
 * stop being readable, so the caller shows these and puts the rest behind
 * "Other" — which is why the count is capped here rather than at the call site.
 *
 * Brand is matched with its spaces removed, because "Hot Wheels" and
 * "Hotwheels" are both in the table and are the same maker. Without that the
 * fourteen split into seven and seven and neither list is right.
 */
export function assortmentChipsFor(cars: Diecast[], brand?: string | null, limit = 4): string[] {
  const want = (brand || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!want) return [];
  const counts = new Map<string, number>();
  const label = new Map<string, string>();
  for (const c of cars) {
    if ((c.brand || "").trim().toLowerCase().replace(/\s+/g, "") !== want) continue;
    const a = (c.assortment || "").trim();
    if (!a) continue;
    const k = a.toLowerCase();
    if (!label.has(k)) label.set(k, a);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([k]) => label.get(k) as string);
}
