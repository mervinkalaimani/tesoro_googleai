import type { CatalogCar } from "@/lib/catalog";
import { catalogMatches } from "@/lib/catalog";
import type { Diecast } from "@/lib/types";

const norm = (v?: string | null) =>
  String(v ?? "")
    .trim()
    .toLowerCase();

/** The eight fields that decide whether two entries describe the same car. */
const FIELDS: { of: (c: CatalogCar) => string; on: (c: Diecast) => string; weight: number }[] = [
  { of: (c) => norm(c.brand), on: (c) => norm(c.brand), weight: 3 },
  { of: (c) => norm(c.make), on: (c) => norm(c.make), weight: 3 },
  { of: (c) => norm(c.model), on: (c) => norm(c.model), weight: 3 },
  { of: (c) => norm(c.car_number), on: (c) => norm(c.carNumber), weight: 3 },
  { of: (c) => norm(c.colour), on: (c) => norm(c.colour), weight: 2 },
  // A variant is what tells two of the same casting apart — "Le Mans 24H 2024
  // #91" from "DTM 2025 #90" — so an entry that agrees on it is much more
  // likely to be the one, and two entries that differ on it rarely are.
  { of: (c) => norm(c.variant), on: (c) => norm(c.variant), weight: 2 },
  { of: (c) => norm(c.series), on: (c) => norm(c.series), weight: 1 },
  { of: (c) => norm(c.sub_series), on: (c) => norm(c.subSeries), weight: 1 },
];

export type Candidate = { car: CatalogCar; score: number; agrees: string[] };

/**
 * The catalogue entries this car might be, best first.
 *
 * Deliberately looser than `findDuplicates`, which answers "is this already
 * filed?" and refuses to guess without brand, make and model. This answers "you
 * pick" — the list is read by somebody who can see the car in front of them, so
 * a near miss in the list costs a glance, and a missing row costs them the
 * feature. Two fields agreeing is enough to appear; the score decides the order
 * rather than the cut.
 *
 * A blank on either side never counts as agreement — that is how a
 * half-filled import row would otherwise "match" everything.
 */
export function catalogueCandidates(
  car: Diecast,
  catalog: CatalogCar[],
  { limit = 20, query = "" } = {},
): Candidate[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const out: Candidate[] = [];

  for (const entry of catalog) {
    if (entry.car_id === car.catalogId) continue;
    let score = 0;
    const agrees: string[] = [];
    for (const f of FIELDS) {
      const a = f.of(entry);
      const b = f.on(car);
      if (a && b && a === b) {
        score += f.weight;
        agrees.push(a);
      }
    }
    // A search overrides the field scoring: somebody typing has a specific
    // entry in mind, and it may be one the car's own fields disagree with —
    // which is the whole reason for re-linking a car by hand.
    if (words.length) {
      if (!catalogMatches(entry, words)) continue;
      out.push({ car: entry, score: score + 1, agrees });
      continue;
    }
    if (score >= 4) out.push({ car: entry, score, agrees });
  }

  return out
    .sort((a, b) => b.score - a.score || a.car.car_id.localeCompare(b.car.car_id))
    .slice(0, limit);
}
