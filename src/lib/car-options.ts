import type { Diecast } from "@/lib/types";
import {
  ASSORTMENTS,
  BRANDS,
  COLOURS,
  MAKES,
  MODELS_BY_MAKE,
  SERIES,
  SIZES,
  SUB_SERIES,
  TYPES,
  VARIANTS_BY_MODEL,
} from "@/lib/car-taxonomy.generated";

/**
 * Suggestions for the catalogue fields on the add-car form.
 *
 * Two sources, deliberately: a seed list so a brand-new collection still offers
 * something to pick, and the collection itself so the list grows into whatever
 * this person actually buys. Nothing here restricts what can be saved — the
 * combobox accepts anything typed, and next time round it comes back as an
 * option because it is now in the collection.
 *
 * The seed is generated from a real, established collection rather than written
 * by hand (see scripts/gen-taxonomy.mjs). A hand-written list drifts towards
 * whatever the author could think of, and it was doing exactly that: models read
 * "Skyline GT-R" and "GT-R R35", which restate the make and swallow the trim.
 * The generated one carries the shape the data is actually kept in — make
 * "Nissan", model "Skyline", variant "R34" — so the three dropdowns divide the
 * name up instead of competing to hold all of it.
 */

export const MAKE_SEED = MAKES;
export const COLOUR_SEED = COLOURS;
export const TYPE_SEED = TYPES;
export const BRAND_SEED = BRANDS;
export const ASSORTMENT_SEED = ASSORTMENTS;
export const SERIES_SEED = SERIES;
export const SUB_SERIES_SEED = SUB_SERIES;

// Scales are a fixed vocabulary rather than an observed one: the handful that
// exist are known in advance, and 1:64 leads because that is what a mainline is.
export const SIZE_SEED = ["1:64", "1:43", "1:32", "1:24", "1:18", "1:12", "1:87", "1:76", ...SIZES];

/**
 * Diecast fields the form offers a flat list of suggestions for. Model and
 * variant are absent on purpose — their lists depend on what sits above them, so
 * they have their own functions.
 */
export type OptionField =
  "make" | "colour" | "type" | "brand" | "assortment" | "size" | "series" | "subSeries" | "seller";

/**
 * Sellers are the one field with no seed and never will have one. They are
 * individual people as often as they are shops, this repository is public, and
 * a suggestion list of somebody else's contacts would be worse than useless —
 * so the list is only ever who *this* collection has already bought from.
 */
export const SELLER_SEED: string[] = [];

const SEEDS: Record<OptionField, string[]> = {
  make: MAKE_SEED,
  colour: COLOUR_SEED,
  type: TYPE_SEED,
  brand: BRAND_SEED,
  assortment: ASSORTMENT_SEED,
  size: SIZE_SEED,
  series: SERIES_SEED,
  subSeries: SUB_SERIES_SEED,
  seller: SELLER_SEED,
};

/**
 * Collected values (duplicates included — they are the ranking) merged with a
 * seed list, most-used first.
 *
 * Ordering by the person's own counts puts the four brands they actually buy
 * above the twenty-six they don't, which is what "popular" means for a list this
 * personal. Case-insensitive de-duplication keeps "Hot Wheels" and "hot wheels"
 * from both appearing; the collected spelling wins, since that is the one
 * already written to every row.
 */
function rank(collected: string[], seed: string[]): string[] {
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();

  for (const value of collected) {
    const raw = (value ?? "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!labels.has(key)) labels.set(key, raw);
  }

  const seedRank = new Map<string, number>();
  seed.forEach((value, index) => {
    const key = value.toLowerCase();
    if (!seedRank.has(key)) seedRank.set(key, index);
    if (!labels.has(key)) labels.set(key, value);
  });

  return [...labels.keys()]
    .sort((a, b) => {
      const byCount = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
      if (byCount) return byCount;
      const rankA = seedRank.get(a) ?? Number.MAX_SAFE_INTEGER;
      const rankB = seedRank.get(b) ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return (labels.get(a) as string).localeCompare(labels.get(b) as string);
    })
    .map((key) => labels.get(key) as string);
}

export function optionsFor(field: OptionField, cars: Diecast[]): string[] {
  return rank(
    cars.map((c) => c[field]),
    SEEDS[field],
  );
}

const norm = (v: string | undefined | null) => (v ?? "").trim().toLowerCase();

/**
 * Models for one make, and only that make.
 *
 * Both sources are narrowed: the collection is filtered to cars of that make,
 * and the seed is looked up by it. A make nobody has bought yet and that isn't
 * in the seed offers nothing, which is correct — an empty list says "type it"
 * far more clearly than a list of another manufacturer's cars.
 *
 * With no make chosen there is nothing to narrow by, so everything is offered.
 */
export function modelOptionsFor(cars: Diecast[], make: string): string[] {
  const wanted = norm(make);

  if (!wanted) {
    return rank(
      cars.map((c) => c.model),
      Object.values(MODELS_BY_MAKE).flat(),
    );
  }

  const sameMake = cars.filter((c) => norm(c.make) === wanted);
  return rank(
    sameMake.map((c) => c.model),
    MODELS_BY_MAKE[wanted] ?? [],
  );
}

/**
 * Variants for one make and model — "R34", "GT-R (R32)", "Kaido House".
 *
 * Narrowed the same way models are, one level further down: a variant only means
 * anything against the model it belongs to. With no model chosen it falls back
 * to every variant recorded for the make, which is still better than the whole
 * catalogue, and to nothing at all when neither is set.
 */
export function variantOptionsFor(cars: Diecast[], make: string, model: string): string[] {
  const wantedMake = norm(make);
  const wantedModel = norm(model);

  if (!wantedMake && !wantedModel) {
    return rank(
      cars.map((c) => c.variant),
      [],
    );
  }

  const matches = cars.filter(
    (c) =>
      (!wantedMake || norm(c.make) === wantedMake) &&
      (!wantedModel || norm(c.model) === wantedModel),
  );

  const seed = wantedModel
    ? (VARIANTS_BY_MODEL[`${wantedMake}|${wantedModel}`] ?? [])
    : Object.entries(VARIANTS_BY_MODEL)
        .filter(([key]) => key.startsWith(`${wantedMake}|`))
        .flatMap(([, values]) => values);

  return rank(
    matches.map((c) => c.variant),
    seed,
  );
}
