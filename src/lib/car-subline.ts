import type { Diecast } from "@/lib/types";

type SubLineFields = Pick<Diecast, "brand" | "assortment" | "series" | "subSeries" | "carNumber">;

/** The parts of a car's standard secondary line, in order, empty ones dropped. */
export function carSubLineParts(r: SubLineFields): string[] {
  return [r.brand, r.assortment, r.series, r.subSeries, r.carNumber]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
}

/**
 * The line under a car's name, everywhere a car is listed:
 * brand · assortment · series · sub series · car number.
 */
export function carSubLine(r: SubLineFields): string {
  return carSubLineParts(r).join(" · ") || "—";
}
