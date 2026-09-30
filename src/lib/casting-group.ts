import type { CatalogCar } from "@/lib/catalog";
import { brandUsesCarNumber, matchPercent } from "@/lib/duplicate";

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
  // Taken out of its casting on purpose, so it rides with nothing. `boxSiblings`
  // has always honoured this; the card drawing did not, which is why detaching
  // three Durangos still drew one card.
  if (c.standalone) return `alone|${c.car_id}`;
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

/**
 * The ID the boxes of one casting share.
 *
 * A catalogue ID is built in slots — brand, make and model, then the box, then
 * series and sub series, then a copy digit. The boxes of one casting therefore
 * already differ in exactly one slot and agree everywhere else, so taking the
 * box's slot out leaves the casting: 070A08-03-0000-1 and 070A08-0J-0000-1 are
 * both 070A08-0000. Nothing is stored for this; it is read off the IDs that
 * are, which is why an assortment's own ID reads as this one with its box put
 * back in.
 *
 * A legacy ID that is not in the scheme is its own casting, and comes back
 * unchanged rather than mangled.
 */
export function castingId(c: Pick<CatalogCar, "car_id">): string {
  const id = (c.car_id || "").trim().toUpperCase();
  const m = /^([0-9A-Z]{6})-[0-9A-Z]{2}-([0-9A-Z]{4})-[0-9A-Z]$/.exec(id);
  return m ? `${m[1]}-${m[2]}` : id;
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
  // Either side saying "I am my own casting" ends it before the description is
  // consulted at all.
  if (entry.standalone) return [];
  return catalog.filter(
    (c) =>
      c.car_id !== entry.car_id &&
      !c.standalone &&
      brandKey(c.brand) === brandKey(entry.brand) &&
      clean(c.make) === clean(entry.make) &&
      clean(c.model) === clean(entry.model) &&
      agrees(c.variant, entry.variant) &&
      agrees(c.series, entry.series) &&
      agrees(c.sub_series, entry.sub_series) &&
      agrees(c.car_number, entry.car_number),
  );
}

/**
 * Entries that look like another box of this casting, for an admin to attach.
 *
 * Grouping is read off the description, so a box only joins a casting once
 * somebody makes the two agree -- which means finding it first. This is that
 * search, and it is deliberately looser than `boxSiblings`: the whole point is
 * to surface an entry that does *not* group yet.
 *
 * Hot Wheels and Matchbox are left out. Their card prints a position rather
 * than a number, so "3/5" is eight different castings, and the one rule strong
 * enough to be worth acting on -- brand and number -- is the one rule that is
 * meaningless for them. `brandUsesCarNumber` already draws that line for the
 * duplicate check and draws it here.
 *
 * An entry in the same box is not a box of the same casting, it is a second
 * copy of the same product, so it is left to the Duplicates page.
 */
export type AttachSuggestion = {
  car: CatalogCar;
  /** Brand and number agree, which names one product. Worth acting on. */
  definite: boolean;
  /** Why it came up, in words, so the judgement stays with the admin. */
  because: string;
  /** How much of the description the two share, 0-100. */
  match: number;
};

export function attachSuggestions(
  entry: CatalogCar,
  catalog: CatalogCar[],
  { exclude = [], limit = 6 }: { exclude?: string[]; limit?: number } = {},
): AttachSuggestion[] {
  if (!brandUsesCarNumber(entry.brand)) return [];
  const brand = brandKey(entry.brand);
  if (!brand) return [];

  const skip = new Set([entry.car_id, ...exclude].map((id) => (id || "").trim().toUpperCase()));
  const number = clean(entry.car_number);
  const make = clean(entry.make);
  const model = clean(entry.model);
  const box = clean(entry.assortment);

  // Both sides have to state a field before it is allowed to disagree: half the
  // catalogue leaves series blank, and silence is not a difference.
  const agrees = (a: string | null | undefined, b: string | null | undefined) => {
    const x = clean(a);
    const y = clean(b);
    return !x || !y || x === y;
  };

  const fields = {
    brand: entry.brand,
    make: entry.make,
    model: entry.model,
    variant: entry.variant,
    colour: entry.colour,
    assortment: entry.assortment,
    series: entry.series,
    subSeries: entry.sub_series,
    carNumber: entry.car_number,
    year: entry.year,
  };

  const out: AttachSuggestion[] = [];
  for (const c of catalog) {
    if (skip.has((c.car_id || "").trim().toUpperCase())) continue;
    if (brandKey(c.brand) !== brand) continue;
    // Same box is the same product filed twice, which is a duplicate.
    if (clean(c.assortment) === box) continue;

    const sameNumber = Boolean(number) && clean(c.car_number) === number;
    const sameCasting =
      Boolean(make) && Boolean(model) && clean(c.make) === make && clean(c.model) === model;

    if (!sameNumber && !sameCasting) continue;
    // A different number on an otherwise identical description is a different
    // product, so it is not offered on the description alone.
    if (!sameNumber && !agrees(c.car_number, entry.car_number)) continue;
    if (
      !sameNumber &&
      !(
        agrees(c.variant, entry.variant) &&
        agrees(c.series, entry.series) &&
        agrees(c.sub_series, entry.sub_series)
      )
    )
      continue;

    out.push({
      car: c,
      definite: sameNumber,
      match: matchPercent(fields, c),
      because: sameNumber
        ? `Same ${entry.brand || "brand"} number #${entry.car_number}`
        : ["Same make and model", c.series || "", c.sub_series || ""].filter(Boolean).join(" · "),
    });
  }

  return out
    .sort((a, b) => Number(b.definite) - Number(a.definite) || b.match - a.match)
    .slice(0, limit);
}
