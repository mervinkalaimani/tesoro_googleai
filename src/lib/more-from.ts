/**
 * The one shelf under a car, and under a catalogue entry.
 *
 * There used to be three rings — the series, the set inside it, and the kind of
 * vehicle — and two of them were drawn. Two shelves is a second page stapled to
 * the first, and the widest ring ("More Mini GT Vans") was the least useful of
 * the three: a type is a filter, not a collection.
 *
 * So: one shelf, narrowest first.
 *
 *   1. The **set** — brand + series + sub series — but only once the set has
 *      more than three cars in it. A set of two is a pair, and a shelf of one
 *      card beside a heading reads as a mistake.
 *   2. The **series** — brand + series.
 *   3. The **model** — brand + make + model — and only for an entry filed under
 *      no series at all. Where a series exists it is the better answer, and
 *      falling through to the model would offer the same casting's other
 *      colours under a heading that sounds like a collection.
 *
 * Both callers pass their own pool with the subject already removed; the rule
 * is the same for a car you own and an entry in the catalogue, which is why it
 * is here rather than written twice.
 */

export type MoreFromFields = {
  brand?: string | null;
  series?: string | null;
  subSeries?: string | null;
  make?: string | null;
  model?: string | null;
};

export type MoreFromRing<T> = {
  key: "set" | "series" | "model";
  /** What the shelf is of, as it is printed. */
  heading: string;
  cars: T[];
};

/** A set smaller than this is a pair, not a collection worth a shelf. */
export const SET_FLOOR = 3;

const n = (v?: string | null) => (v || "").trim().toLowerCase();
const t = (v?: string | null) => (v || "").trim();

export function moreFrom<T>(
  subject: MoreFromFields,
  pool: T[],
  read: (c: T) => MoreFromFields,
): MoreFromRing<T> | null {
  const brand = n(subject.brand);
  if (!brand) return null;

  // Every ring is the brand's: Car Culture is a Hot Wheels idea, and a Matchbox
  // car sharing the word was never the same series.
  const kin = pool.filter((c) => n(read(c).brand) === brand);
  const series = n(subject.series);
  const sub = n(subject.subSeries);

  if (series && sub) {
    const cars = kin.filter((c) => n(read(c).series) === series && n(read(c).subSeries) === sub);
    if (cars.length > SET_FLOOR) return { key: "set", heading: t(subject.subSeries), cars };
  }

  if (series) {
    const cars = kin.filter((c) => n(read(c).series) === series);
    if (cars.length) return { key: "series", heading: t(subject.series), cars };
  }

  if (!series && !sub) {
    const make = n(subject.make);
    const model = n(subject.model);
    if (make && model) {
      const cars = kin.filter((c) => n(read(c).make) === make && n(read(c).model) === model);
      if (cars.length)
        return {
          key: "model",
          heading: [t(subject.make), t(subject.model)].filter(Boolean).join(" "),
          cars,
        };
    }
  }

  return null;
}
