import { statusRank } from "@/lib/status";
import type { Diecast } from "@/lib/types";

/**
 * The order cars are always listed in.
 *
 * The statuses themselves, their spellings and their ranking all live in
 * `status.ts` now; what is left here is only how a list of cars is put in
 * order, which is the one thing this module was ever imported for.
 */
export { statusRank, isPreOrder } from "@/lib/status";

/** SNO is absent until a locally-added car round-trips through Supabase. */
function snoOf(car: Diecast): number {
  return typeof car.sno === "number" ? car.sno : Number.MAX_SAFE_INTEGER;
}

/**
 * Status group first, then insertion order within the group. A car that arrives
 * therefore lands directly after the last In Hand car, which is the position
 * its SNO would give it if the table were renumbered.
 */
export function compareCars(a: Diecast, b: Diecast): number {
  const byStatus = statusRank(a.status) - statusRank(b.status);
  if (byStatus !== 0) return byStatus;

  const bySno = snoOf(a) - snoOf(b);
  if (bySno !== 0) return bySno;

  return (a.id || "").localeCompare(b.id || "");
}

export function sortCars(cars: Diecast[]): Diecast[] {
  return [...cars].sort(compareCars);
}
