import type { Diecast } from "@/lib/types";

/**
 * The order cars are always listed in. Statuses earlier in this list sort
 * first; within a status, cars keep their SNO (insertion) order.
 */
export const STATUS_ORDER = [
  ["available", "wrong item"],
  ["out for delivery"],
  ["transit"],
  ["waiting"],
  ["pre order", "preorder"],
  ["delayed"],
  ["on hold", "onhold"],
  ["lost"],
  ["iso"],
] as const;

const RANK = new Map<string, number>();
STATUS_ORDER.forEach((aliases, i) => {
  for (const a of aliases) RANK.set(a, i);
});

/** Anything unrecognised sorts after every known status rather than first. */
export function statusRank(status: string | undefined | null): number {
  const key = (status || "").trim().toLowerCase();
  const hit = RANK.get(key);
  if (hit !== undefined) return hit;
  // Tolerate spacing and punctuation drift, e.g. "Pre-Order" or "OnHold".
  const squashed = key.replace(/[^a-z]/g, "");
  for (const [alias, rank] of RANK) {
    if (alias.replace(/[^a-z]/g, "") === squashed) return rank;
  }
  return STATUS_ORDER.length;
}

/** SNO is absent until a locally-added car round-trips through Supabase. */
function snoOf(car: Diecast): number {
  return typeof car.sno === "number" ? car.sno : Number.MAX_SAFE_INTEGER;
}

/**
 * Status group first, then insertion order within the group. A car that becomes
 * Available therefore lands directly after the last Available car, which is the
 * position its SNO would give it if the table were renumbered.
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
