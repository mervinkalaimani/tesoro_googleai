import type { CatalogCar } from "@/lib/catalog";

/**
 * One card per casting, however many boxes it was sold in.
 *
 * A casting is brand + make + model + variant + series + sub-series + car
 * number. Assortment is deliberately not part of it: a Mini GT Huracán #1377
 * is the same car whether it came on a blister or in a box, and listing it
 * twice made the catalogue look like it held two Huracáns.
 *
 * Car number carries the most weight of the seven — where a brand prints one
 * it names exactly one product — which is why two entries agreeing on
 * everything else but differing in number stay apart.
 *
 * The entries themselves are left alone. Nothing is merged, nothing is
 * deleted, no car_id changes: this is a grouping applied when the list is
 * drawn. That matters because the assortments genuinely differ — a Matchbox
 * Bronco is ₹179 as Mainline and ₹399 as Moving Parts, and an owned car
 * points at the exact box it came in.
 */

const clean = (v: string | null | undefined) => (v || "").trim().toLowerCase();

/**
 * Brand without its spaces, because "Hot Wheels" and "Hotwheels" are both in
 * the table and are one maker. Without this the same casting filed under each
 * spelling stays two cards.
 */
const brandKey = (v: string | null | undefined) => clean(v).replace(/\s+/g, "");

export function castingKey(c: CatalogCar): string {
  return [
    brandKey(c.brand),
    clean(c.make),
    clean(c.model),
    clean(c.variant),
    clean(c.series),
    clean(c.sub_series),
    clean(c.car_number),
  ].join("|");
}

export type CastingGroup = {
  key: string;
  /** The entry the card stands for: the cheapest, so the range reads upward. */
  lead: CatalogCar;
  /** Every entry in the group, cheapest first. One of them is the lead. */
  members: CatalogCar[];
  /** Distinct assortment names across the group, in the members' order. */
  assortments: string[];
};

const priceOf = (c: CatalogCar) => {
  const n = typeof c.mrp === "number" ? c.mrp : Number(c.mrp);
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
};

/**
 * Groups in the order their first member appeared, so whatever sort the page
 * applied still decides where a card sits.
 */
export function groupCastings(entries: CatalogCar[]): CastingGroup[] {
  const byKey = new Map<string, CatalogCar[]>();
  const order: string[] = [];
  for (const c of entries) {
    const k = castingKey(c);
    const at = byKey.get(k);
    if (at) at.push(c);
    else {
      byKey.set(k, [c]);
      order.push(k);
    }
  }

  return order.map((key) => {
    const members = [...(byKey.get(key) as CatalogCar[])].sort((a, b) => priceOf(a) - priceOf(b));
    const seen = new Set<string>();
    const assortments: string[] = [];
    for (const m of members) {
      const a = (m.assortment || "").trim();
      if (a && !seen.has(a.toLowerCase())) {
        seen.add(a.toLowerCase());
        assortments.push(a);
      }
    }
    return { key, lead: members[0], members, assortments };
  });
}

/** "₹1,399 – ₹1,499", or a single price when the boxes agree. */
export function priceRange(members: CatalogCar[]): { low: number; high: number } | null {
  const prices = members.map(priceOf).filter((n) => Number.isFinite(n));
  if (prices.length === 0) return null;
  return { low: Math.min(...prices), high: Math.max(...prices) };
}

/**
 * The other boxes one entry is sold in, for the two forms that file them.
 *
 * Deliberately looser than `castingKey`, and only here. The key demands seven
 * fields agree exactly, which is right for drawing the catalogue -- two entries
 * with different collector numbers really are two products. It is wrong for
 * "which boxes is this casting in", because half the catalogue leaves a field
 * blank: the CCA Camaro SS is filed four times, three with no car number and
 * one with S10-02, and on the key those are four castings rather than one in
 * four boxes.
 *
 * So a field only speaks when both sides state it -- the rule
 * `isCarMatchingCatalog` already uses for colour and variant. Brand, make and
 * model still have to match outright: silence about those is not agreement,
 * it is an empty row.
 */
export function boxSiblings(entry: CatalogCar, catalog: CatalogCar[]): CatalogCar[] {
  const agrees = (a: string | null | undefined, b: string | null | undefined) => {
    const x = clean(a);
    const y = clean(b);
    return !x || !y || x === y;
  };
  return catalog.filter(
    (c) =>
      c.car_id !== entry.car_id &&
      brandKey(c.brand) === brandKey(entry.brand) &&
      clean(c.make) === clean(entry.make) &&
      clean(c.model) === clean(entry.model) &&
      agrees(c.variant, entry.variant) &&
      agrees(c.series, entry.series) &&
      agrees(c.sub_series, entry.sub_series) &&
      agrees(c.car_number, entry.car_number),
  );
}
