/**
 * Which cars in a collection are the car in the photograph.
 *
 * The old matcher scored every attribute it could and kept anything that
 * scored at all, which is how a scan of a black Hot Wheels came back with 836
 * "matches": every black car, every Hot Wheels car, and — because the tests
 * were bare substring tests — every car whose model contains the letter E.
 *
 * A match is not a score. Two cars are the same casting or they are not, and
 * the thing that decides it is the model. So the model has to agree before
 * anything else is counted, and the rest of the attributes only order what is
 * left. A photograph with no model read off it matches on the make and one
 * other agreeing fact, or it matches nothing: better to say "nothing certain"
 * than to hand somebody a page of cars that share a colour.
 *
 * Nothing here touches React or the database, so the self-check can hold a
 * collection in an array.
 */

export type ScanAttributes = {
  make?: string;
  model?: string;
  variant?: string;
  year?: string;
  colour?: string;
  type?: string;
  series?: string;
  subSeries?: string;
  carNumber?: string;
  brand?: string;
  assortment?: string;
  size?: string;
};

/** Everything the matcher reads off a car. A Diecast satisfies it. */
export type MatchableCar = {
  name?: string | null;
  make?: string | null;
  model?: string | null;
  variant?: string | null;
  year?: string | number | null;
  colour?: string | null;
  type?: string | null;
  series?: string | null;
  carNumber?: string | null;
  brand?: string | null;
};

export type Match<C> = {
  car: C;
  /** For ordering only. Never for deciding whether this is a match. */
  score: number;
  /** What agreed, for the chips under the name. */
  matched: { label: string; value: string }[];
};

/** How many matches are worth showing. Beyond this it is a list, not an answer. */
export const MAX_MATCHES = 5;

const norm = (s?: string | number | null) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Words worth comparing. "the", "a" and single letters are not. */
const words = (s: string) => s.split(" ").filter((w) => w.length >= 3);

/**
 * Whether two names are the same casting's name.
 *
 * Equal after normalising, or one is a run of whole words of the other — "FJ
 * Cruiser" against "Toyota FJ Cruiser" is the same car described twice, and
 * "Civic" against "Civic Type R" is not something this can tell apart, so it
 * takes it as a match and lets the other attributes order it.
 *
 * Never a bare substring: that is what made "E" match everything.
 */
export function sameName(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const xs = words(x);
  const ys = words(y);
  if (xs.length === 0 || ys.length === 0) return false;
  const [short, long] = xs.length <= ys.length ? [xs, ys] : [ys, xs];
  return short.every((w) => long.includes(w));
}

/** Whether two one-word facts agree. Equality, not containment. */
const same = (a?: string | number | null, b?: string | number | null) => {
  const x = norm(a);
  const y = norm(b);
  return Boolean(x) && x === y;
};

/**
 * The cars that are the photographed car, best first.
 *
 * Returns at most `limit`. An empty array means nothing in the collection is
 * certainly this car, which is a real answer and the honest one.
 */
export function matchScannedCar<C extends MatchableCar>(
  attrs: ScanAttributes | null | undefined,
  cars: readonly C[],
  limit = MAX_MATCHES,
): Match<C>[] {
  if (!attrs) return [];

  const model = norm(attrs.model);
  const make = norm(attrs.make);
  const out: Match<C>[] = [];

  for (const car of cars) {
    const matched: { label: string; value: string }[] = [];
    let score = 0;

    // THE GATE. Everything below only runs for a car that is already this car.
    if (model) {
      const byModel = sameName(model, String(car.model ?? ""));
      const byName = sameName(model, String(car.name ?? ""));
      if (!byModel && !byName) continue;
      score += norm(car.model) === model || norm(car.name) === model ? 50 : 35;
      matched.push({ label: "Model", value: String(car.model || car.name || "") });
    } else if (make) {
      // No model read off the card. The make alone is a brand of car, not a
      // car, so it needs one more agreeing fact to count as a match.
      if (!same(make, car.make)) continue;
      const corroborates =
        same(attrs.brand, car.brand) ||
        same(attrs.carNumber, car.carNumber) ||
        same(attrs.series, car.series) ||
        same(attrs.year, car.year);
      if (!corroborates) continue;
      score += 20;
    } else {
      // Neither. There is nothing here to match on.
      continue;
    }

    if (model && make && same(make, car.make)) {
      score += 20;
      matched.push({ label: "Make", value: String(car.make) });
    }
    if (same(attrs.carNumber, car.carNumber)) {
      score += 25;
      matched.push({ label: "#", value: String(car.carNumber) });
    }
    if (same(attrs.brand, car.brand)) {
      score += 15;
      matched.push({ label: "Brand", value: String(car.brand) });
    }
    if (same(attrs.series, car.series)) {
      score += 15;
      matched.push({ label: "Series", value: String(car.series) });
    }
    if (same(attrs.colour, car.colour)) {
      score += 12;
      matched.push({ label: "Colour", value: String(car.colour) });
    }
    if (same(attrs.year, car.year)) {
      score += 10;
      matched.push({ label: "Year", value: String(car.year) });
    }
    if (same(attrs.variant, car.variant)) {
      score += 10;
      matched.push({ label: "Variant", value: String(car.variant) });
    }
    if (same(attrs.type, car.type)) score += 5;

    out.push({ car, score, matched });
  }

  out.sort((a, b) => b.score - a.score || b.matched.length - a.matched.length);
  return out.slice(0, Math.max(0, limit));
}
