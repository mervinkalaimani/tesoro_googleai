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
 * Brand, make, model and variant must all match outright; colour, number,
 * series and sub series then have to agree wherever both sides state them, and agreeing on both is
 * what makes a suggestion definite. Hot Wheels and Matchbox are included, but
 * their number is ignored: it is a position in a series, which changes from
 * one box of a car to the next (`brandUsesCarNumber` draws that line).
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
  const brand = brandKey(entry.brand);
  const make = clean(entry.make);
  const model = clean(entry.model);
  // Without all three there is nothing to say the two are the same car.
  if (!brand || !make || !model) return [];

  const skip = new Set([entry.car_id, ...exclude].map((id) => (id || "").trim().toUpperCase()));
  const box = clean(entry.assortment);
  const variant = clean(entry.variant);

  // "-" and friends are an empty box on the form, not a number.
  const realNumber = (v: string | null | undefined) => {
    const x = clean(v);
    return /[a-z0-9]/.test(x) ? x : "";
  };
  // Hot Wheels and Matchbox print a position in a series, which differs from
  // one box of a car to the next, so for them the number says nothing.
  const numbered = brandUsesCarNumber(entry.brand);
  const number = numbered ? realNumber(entry.car_number) : "";
  const colour = clean(entry.colour);

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
    // These four have to match outright. A blank against a stated variant is a
    // different car, not silence.
    if (brandKey(c.brand) !== brand) continue;
    if (clean(c.make) !== make || clean(c.model) !== model) continue;
    if (clean(c.variant) !== variant) continue;
    // Same box is the same product filed twice, which is a duplicate.
    if (clean(c.assortment) === box) continue;

    // Colour and number then speak only when both sides state them: a different
    // one is a different car, a missing one is not a difference.
    const theirColour = clean(c.colour);
    if (colour && theirColour && colour !== theirColour) continue;
    const theirNumber = numbered ? realNumber(c.car_number) : "";
    if (number && theirNumber && number !== theirNumber) continue;

    // Series and sub series are read the same way.
    const agrees = (x: string | null | undefined, y: string | null | undefined) =>
      !clean(x) || !clean(y) || clean(x) === clean(y);
    if (!agrees(c.series, entry.series) || !agrees(c.sub_series, entry.sub_series)) continue;

    const sameColour = Boolean(colour) && colour === theirColour;
    const sameNumber = Boolean(number) && number === theirNumber;
    out.push({
      car: c,
      definite: sameColour && sameNumber,
      match: matchPercent(fields, c),
      because: [
        "Same brand, make, model" + (variant ? " and variant" : ""),
        sameColour ? `colour ${entry.colour}` : "",
        sameNumber ? `number #${entry.car_number}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  return out
    .sort((a, b) => Number(b.definite) - Number(a.definite) || b.match - a.match)
    .slice(0, limit);
}
