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
 * Candidate duplicates for what has been typed, most certain first.
 *
 * Brand always has to agree — a Mini GT Supra is not a Majorette one — and
 * everything below it is a matter of how much else does.
 *
 * For brands like Hot Wheels and Matchbox mainlines where car number is not
 * available, candidates are matched against the maximum available fields
 * (make, model, colour, assortment, series, subSeries, variant, year).
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

  const variant = norm(fields.variant);
  const colour = norm(fields.colour);
  const assortment = norm(fields.assortment);
  const series = norm(fields.series);
  const subSeries = norm(fields.subSeries);
  const carNumber = norm(fields.carNumber);
  const year = norm(fields.year);
  const numbered = brandUsesCarNumber(fields.brand) && carNumber !== "";
  const skip = excludeCarId.trim().toUpperCase();

  type ScoredHit = DuplicateHit & { score: number };
  const hits: ScoredHit[] = [];

  for (const c of catalog) {
    if (skip && c.car_id.toUpperCase() === skip) continue;
    if (brandKey(c.brand) !== brand) continue;

    // Check year: if both specify a year and they differ by more than 1, less likely to be identical
    const cYear = norm(c.year);
    const sameYear = !year || !cYear || year === cYear;

    const cAssortment = norm(c.assortment);
    const sameAssortment = assortment !== "" && assortment === cAssortment;

    // Collector number match (for numbered brands like Mini GT, Pop Race)
    if (numbered && sameAssortment && norm(c.car_number) === carNumber) {
      hits.push({
        car: c,
        level: "certain",
        because: `Same ${fields.brand?.trim() || "brand"} number #${fields.carNumber?.trim()} in ${c.assortment || "this assortment"}`,
        score: 100,
      });
      continue;
    }

    // Match make and model
    const cMake = norm(c.make);
    const cModel = norm(c.model);
    const cName = norm(c.name);
    const targetName = norm(`${make} ${model}`);

    const makeMatches = cMake === make || (!cMake && cName.includes(make));
    const modelMatches =
      cModel === model || cModel.includes(model) || model.includes(cModel) || cName.includes(model);

    if (!makeMatches || !modelMatches) {
      // Also check full combined name
      if (cName !== targetName && !cName.includes(targetName)) {
        continue;
      }
    }

    // Match maximum fields
    const cColour = norm(c.colour);
    const sameColour =
      colour !== "" &&
      cColour !== "" &&
      (colour === cColour || cColour.includes(colour) || colour.includes(cColour));

    const cVariant = norm(c.variant);
    const sameVariant =
      variant !== "" && cVariant !== "" && (variant === cVariant || cVariant.includes(variant));

    const cSeries = norm(c.series);
    const sameSeries =
      series !== "" && cSeries !== "" && (series === cSeries || cSeries.includes(series));

    const cSubSeries = norm(c.sub_series);
    const sameSubSeries = subSeries !== "" && cSubSeries !== "" && subSeries === cSubSeries;

    const cCarNum = norm(c.car_number);
    const sameCarNum = carNumber !== "" && cCarNum !== "" && carNumber === cCarNum;

    // Calculate match score and collect matched fields for the explanation
    let score = 10; // Base score for make & model match
    const matchedList: string[] = ["make", "model"];

    if (sameColour) {
      score += 25;
      matchedList.push(`colour (${c.colour})`);
    }
    if (sameAssortment) {
      score += 20;
      matchedList.push(`assortment (${c.assortment})`);
    }
    if (sameSeries) {
      score += 15;
      matchedList.push(`series (${c.series})`);
    }
    if (sameSubSeries) {
      score += 10;
      matchedList.push("sub-series");
    }
    if (sameVariant) {
      score += 15;
      matchedList.push(`variant (${c.variant})`);
    }
    if (sameCarNum) {
      score += 20;
      matchedList.push(`number #${c.car_number}`);
    }
    if (year && cYear && year === cYear) {
      score += 10;
      matchedList.push(`year (${c.year})`);
    }

    // Determine level:
    // Even for Hot Wheels and Matchbox mainlines without collector car number:
    // If make, model, colour and assortment match:
    // This is a certain/likely duplicate of that mainline release!
    let level: DuplicateLevel = "possible";
    if (sameColour && sameAssortment && (sameSeries || sameVariant || sameYear || sameCarNum)) {
      level = "certain";
    } else if (sameColour && sameAssortment) {
      level = "certain";
    } else if (sameColour && (sameSeries || sameVariant || sameYear)) {
      level = "likely";
    } else if (sameAssortment && sameSeries) {
      level = "likely";
    } else if (sameColour) {
      level = "likely";
    }

    const because = `Matches ${matchedList.join(", ")}`;

    hits.push({
      car: c,
      level,
      because,
      score,
    });
  }

  const rank: Record<DuplicateLevel, number> = { certain: 0, likely: 1, possible: 2 };
  hits.sort((a, b) => rank[a.level] - rank[b.level] || b.score - a.score);
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
