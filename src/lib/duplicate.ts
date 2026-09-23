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
  year?: string | null;
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
 * Candidate duplicates for what has been typed.
 *
 * Two ways in, and nothing else counts:
 *
 *   1. Brand and car number agree. The number names one product, so this needs
 *      nothing else filled in yet.
 *   2. Brand, make, model, assortment, series, sub-series and car number ALL
 *      agree. A blank on both sides is agreement — two Hot Wheels mainlines
 *      with no series between them are the same mainline — but a blank against
 *      a value is not.
 *
 * It used to score partial matches instead, and offered anything sharing a
 * make and a model. Typing "Porsche 911" brought back six different castings —
 * a Carrera RS38, a GT3 R, a GT1, two mainline Carreras — each labelled as an
 * existing car to add instead. A suggestion list that is wrong six times out
 * of six is worse than none: it trains you to scroll past the one time it is
 * right.
 *
 * There is no partial credit any more, so every hit is "certain" and the
 * levels only survive for the Duplicates page below.
 *
 * Variant is deliberately absent from rule 2, because the list of fields came
 * from the person who uses this. Two variants of one casting that both lack a
 * car number will therefore still be offered to each other.
 *
 * needsCarNumber below is untouched: whether a brand has to state its number
 * is a question about filling the form in, not about what a duplicate is.
 */
export function findDuplicates(
  fields: DuplicateFields,
  catalog: CatalogCar[],
  { excludeCarId = "", limit = 6 }: { excludeCarId?: string; limit?: number } = {},
): DuplicateHit[] {
  const brand = brandKey(fields.brand);
  const make = norm(fields.make);
  const model = norm(fields.model);
  // Too little to say anything useful.
  if (!brand || !make || !model) return [];

  const assortment = norm(fields.assortment);
  const series = norm(fields.series);
  const subSeries = norm(fields.subSeries);
  const carNumber = norm(fields.carNumber);
  const skip = excludeCarId.trim().toUpperCase();

  const hits: DuplicateHit[] = [];

  for (const c of catalog) {
    if (skip && c.car_id.toUpperCase() === skip) continue;
    if (brandKey(c.brand) !== brand) continue;

    // The number names one product, so brand and number agreeing is enough on
    // its own — the rest of the fields need not be filled in yet.
    if (carNumber && norm(c.car_number) === carNumber) {
      hits.push({
        car: c,
        level: "certain",
        because: `Same ${c.brand || "brand"} number #${c.car_number}`,
      });
      continue;
    }

    // Otherwise every field has to agree. A blank on both sides counts as
    // agreement — two Hot Wheels mainlines with no series between them are
    // still the same mainline — but a blank against a value does not.
    if (norm(c.make) !== make) continue;
    if (norm(c.model) !== model) continue;
    if (norm(c.assortment) !== assortment) continue;
    if (norm(c.series) !== series) continue;
    if (norm(c.sub_series) !== subSeries) continue;
    if (norm(c.car_number) !== carNumber) continue;

    hits.push({
      car: c,
      level: "certain",
      because: [
        "Same casting",
        c.assortment && `${c.assortment}`,
        c.series && `${c.series}`,
        c.sub_series && `${c.sub_series}`,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  return hits.slice(0, limit);
}

/** A set of catalogue entries that look like one casting. */
export type DuplicateGroup = {
  /** Stable across renders, so a chosen keeper survives the list refreshing. */
  key: string;
  level: DuplicateLevel;
  label: string;
  because: string;
  cars: CatalogCar[];
};

/**
 * Every group of catalogue entries that look like duplicates of each other.
 *
 * Two passes, because two different things make a duplicate certain. A shared
 * collector number within one assortment is the strongest evidence there is —
 * that number names one product — but only for the brands that print one.
 * Everything else is judged on the description agreeing all the way down.
 *
 * Boxes are left out. A multipack shares its make and model with nothing, and
 * merging one would take its contents with it.
 */
export function findDuplicateGroups(catalog: CatalogCar[]): DuplicateGroup[] {
  const certain = new Map<string, CatalogCar[]>();
  const likely = new Map<string, CatalogCar[]>();

  for (const c of catalog) {
    if (c.is_multipack) continue;
    const brand = brandKey(c.brand);
    if (!brand) continue;
    const assortment = norm(c.assortment);
    const number = norm(c.car_number);
    const year = norm(c.year);

    if (brandUsesCarNumber(c.brand) && number) {
      const k = `n|${brand}|${assortment}|${number}|${year}`;
      (certain.get(k) ?? certain.set(k, []).get(k)!).push(c);
      continue;
    }

    const k = [
      "d",
      brand,
      norm(c.make),
      norm(c.model),
      norm(c.variant),
      norm(c.colour),
      assortment,
      norm(c.series),
      norm(c.sub_series),
      year,
    ].join("|");
    if (!norm(c.make) || !norm(c.model)) continue;
    (likely.get(k) ?? likely.set(k, []).get(k)!).push(c);
  }

  const out: DuplicateGroup[] = [];
  const nameOf = (c: CatalogCar) => c.name || `${c.make} ${c.model}`.trim();

  for (const [key, cars] of certain) {
    if (cars.length < 2) continue;
    out.push({
      key,
      level: "certain",
      label: `${cars[0].brand} ${cars[0].car_number} · ${nameOf(cars[0])}`,
      because: `${cars.length} entries share ${cars[0].brand} number ${cars[0].car_number} in ${cars[0].assortment || "this assortment"}`,
      cars,
    });
  }
  for (const [key, cars] of likely) {
    if (cars.length < 2) continue;
    out.push({
      key,
      level: "likely",
      label: `${nameOf(cars[0])} · ${cars[0].colour || "no colour"}`,
      because: `${cars.length} entries with the same casting, colour, assortment and series`,
      cars,
    });
  }

  const rank: Record<DuplicateLevel, number> = { certain: 0, likely: 1, possible: 2 };
  return out.sort(
    (a, b) =>
      rank[a.level] - rank[b.level] ||
      b.cars.length - a.cars.length ||
      a.label.localeCompare(b.label),
  );
}
