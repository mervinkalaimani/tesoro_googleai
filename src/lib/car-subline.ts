import type { Diecast } from "@/lib/types";

// Partial, because that is what it has always accepted: every field is
// coerced through String(v ?? "") below, and a caller with half a car in hand
// -- a catalogue entry, a scan result -- is the normal case rather than the
// exception.
type SubLineFields = Partial<
  Pick<Diecast, "brand" | "assortment" | "series" | "subSeries" | "carNumber" | "caseNumber">
>;

/**
 * The parts of a car's standard secondary line, in order, empty ones dropped.
 * A case release ("2026 K Case") stands in the car number's place, since a car
 * from a case has no number of its own.
 */
export function carSubLineParts(r: SubLineFields, skipBrand = false, skipNumber = false): string[] {
  return [
    ...(skipBrand ? [] : [r.brand, r.assortment]),
    r.series,
    r.subSeries,
    // Dropped where the number is printed in a column of its own -- the cars
    // table puts it beside the assortment now, and a row should not say the
    // same thing twice.
    ...(skipNumber ? [] : [r.carNumber || r.caseNumber]),
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
}

/**
 * The line under a car's name, everywhere a car is listed:
 * brand · assortment · series · sub series · car or case number.
 *
 * `skipBrand` drops the first two, for a list that has a column of its own for
 * them — repeating "Hot Wheels · Mainline" under the name and again two columns
 * to the right is the same fact twice on one row.
 */
export function carSubLine(r: SubLineFields, skipBrand = false, skipNumber = false): string {
  return carSubLineParts(r, skipBrand, skipNumber).join(" · ") || "—";
}

/** The number a car is known by: its own, or the case it came in. */
export function carNumberOf(r: SubLineFields): string {
  return String(r.carNumber || r.caseNumber || "").trim();
}
