import type { CatalogCar } from "@/lib/catalog";

/**
 * Catching a casting that is already in the catalogue, before a second copy of
 * it is filed.
 *
 * The catalogue is shared, so a duplicate is not a private mess: everyone
 * browsing sees the same casting twice, the owners of it are split across two
 * entries, and neither one is wrong enough to delete. Cheaper to notice at the
 * moment of typing.
 *
 * Nothing here blocks a save. Two entries that look identical sometimes are
 * two products — Matchbox reissues a casting every year with only the year on
 * the card changing — so this offers what it found and lets you decide.
 */

/** How sure we are, in the order they are shown. */
export type DuplicateLevel = "certain" | "likely" | "possible";

export type DuplicateHit = {
  car: CatalogCar;
  level: DuplicateLevel;
  /** Why this one came up, in words, so the judgement is yours and not ours. */
  because: string;
};

/** The fields a duplicate is judged on. Both forms speak this shape. */
export type DuplicateFields = {
  brand?: string | null;
  make?: string | null;
  model?: string | null;
  variant?: string | null;
  colour?: string | null;
  assortment?: string | null;
  series?: string | null;
  subSeries?: string | null;
  carNumber?: string | null;
};

const norm = (s: string | null | undefined) =>
  (s || "")
    .toLowerCase()
    .replace(/['"’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Brand without its spaces, so "Hot Wheels" and "Hotwheels" are one brand. */
export const brandKey = (s: string | null | undefined) => norm(s).replace(/ /g, "");

/**
 * Brands whose car number identifies the casting.
 *
 * Hot Wheels and Matchbox print a position rather than a number — "3/5" is the
 * third of five in a series, and the catalogue has eight different castings
 * carrying "1/5". Everyone else prints a collector number that belongs to one
 * product: Mini GT 1133, Kaido House KHMG217. That is the difference, and it
 * is why the number is asked for everywhere except those two.
 */
const POSITION_ONLY_BRANDS = new Set(["hotwheels", "matchbox"]);

export const brandUsesCarNumber = (brand: string | null | undefined) => {
  const key = brandKey(brand);
  return key.length > 0 && !POSITION_ONLY_BRANDS.has(key);
};

/** Whether this casting must state a car number before it can be filed. */
export const needsCarNumber = (brand: string | null | undefined) => brandUsesCarNumber(brand);

/**
 * Candidate duplicates for what has been typed, most certain first.
 *
 * Brand always has to agree — a Mini GT Supra is not a Majorette one — and
 * everything below it is a matter of how much else does.
 */
export function findDuplicates(
  fields: DuplicateFields,
  catalog: CatalogCar[],
  { excludeCarId = "", limit = 4 }: { excludeCarId?: string; limit?: number } = {},
): DuplicateHit[] {
  const brand = brandKey(fields.brand);
  const make = norm(fields.make);
  const model = norm(fields.model);
  // Too little to say anything useful. Offering candidates off a half-typed
  // make is how a helpful panel becomes one people learn to ignore.
  if (!brand || !make || !model) return [];

  const variant = norm(fields.variant);
  const colour = norm(fields.colour);
  const assortment = norm(fields.assortment);
  const series = norm(fields.series);
  const subSeries = norm(fields.subSeries);
  const carNumber = norm(fields.carNumber);
  const numbered = brandUsesCarNumber(fields.brand) && carNumber !== "";
  const skip = excludeCarId.trim().toUpperCase();

  const hits: DuplicateHit[] = [];

  for (const c of catalog) {
    if (skip && c.car_id.toUpperCase() === skip) continue;
    if (brandKey(c.brand) !== brand) continue;

    const sameAssortment = assortment === norm(c.assortment);

    // A collector number and its assortment name one product. Two cars may
    // share a number when the assortment differs — that is a different range
    // counting from one again, not the same car twice.
    if (numbered && sameAssortment && norm(c.car_number) === carNumber) {
      hits.push({
        car: c,
        level: "certain",
        because: `Same ${fields.brand?.trim() || "brand"} number ${fields.carNumber?.trim()} in ${c.assortment || "this assortment"}`,
      });
      continue;
    }

    if (norm(c.make) !== make || norm(c.model) !== model) continue;

    const sameColour = colour !== "" && colour === norm(c.colour);
    const sameVariant = variant === norm(c.variant);
    const sameSeries = series === norm(c.series) && subSeries === norm(c.sub_series);

    if (sameColour && sameVariant && sameAssortment && sameSeries) {
      hits.push({
        car: c,
        level: "likely",
        because: "Same casting, colour, assortment and series",
      });
      continue;
    }

    if (sameColour && sameAssortment) {
      hits.push({ car: c, level: "possible", because: "Same casting and colour" });
      continue;
    }

    if (sameColour || (sameVariant && sameAssortment && sameSeries)) {
      hits.push({
        car: c,
        level: "possible",
        because: sameColour ? "Same casting and colour, filed elsewhere" : "Same casting",
      });
    }
  }

  const rank: Record<DuplicateLevel, number> = { certain: 0, likely: 1, possible: 2 };
  hits.sort((a, b) => rank[a.level] - rank[b.level]);
  return hits.slice(0, limit);
}
