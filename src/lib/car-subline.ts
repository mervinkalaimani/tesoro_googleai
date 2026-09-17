import type { Diecast } from "@/lib/types";

type SubLineFields = Pick<
  Diecast,
  "brand" | "assortment" | "series" | "subSeries" | "carNumber" | "caseNumber"
>;

/**
 * The parts of a car's standard secondary line, in order, empty ones dropped.
 * A case release ("2026 K Case") stands in the car number's place, since a car
 * from a case has no number of its own.
 */
export function carSubLineParts(r: SubLineFields): string[] {
  return [r.brand, r.assortment, r.series, r.subSeries, r.carNumber || r.caseNumber]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
}

/**
 * The line under a car's name, everywhere a car is listed:
 * brand · assortment · series · sub series · car or case number.
 */
export function carSubLine(r: SubLineFields): string {
  return carSubLineParts(r).join(" · ") || "—";
}
