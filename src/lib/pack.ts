import type { CatalogCar } from "@/lib/catalog";
import type { Diecast } from "@/lib/types";

/**
 * Counting a collection that contains boxes.
 *
 * A 5-pack is one row you own and five cars you have. Both readings are true
 * and people want different ones at different moments — "how many cars do I
 * own" and "how many things are on the shelf" — so the app holds one preference
 * and every total obeys it. The rules live here rather than in each page
 * because seven of them counted cars their own way and would drift apart.
 *
 * Money is deliberately absent. A box carries one price whichever way it is
 * counted, so spend never passes through any of this.
 */

/** "cars": a box counts as what is in it. "items": a box counts once. */
export type CountMode = "cars" | "items";

export const COUNT_MODES: { value: CountMode; label: string; hint: string }[] = [
  { value: "cars", label: "The cars in it", hint: "A 5-pack counts as five." },
  { value: "items", label: "One item", hint: "A 5-pack counts as one." },
];

export const isCountMode = (v: unknown): v is CountMode => v === "cars" || v === "items";

/**
 * How many cars a box holds, by its catalogue entry.
 *
 * `pack_size` is what the product says it contains, and it is preferred over
 * the member count because a part-filled pack is still a box of five. Falling
 * back to the members covers a pack flagged before anyone said how big it is.
 */
export function packSizes(
  catalog: CatalogCar[],
  members: Record<string, string[]>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of catalog) {
    if (!c.is_multipack) continue;
    const declared = Number(c.pack_size) || 0;
    const listed = members[c.car_id]?.length ?? 0;
    const size = declared || listed;
    // A box of one is not a box. Anything that cannot say how many it holds
    // counts as the single thing it is, which is what it did before packs.
    if (size > 1) out.set(c.car_id.toUpperCase(), size);
  }
  return out;
}

/**
 * Every casting that sits inside some box, by car_id.
 *
 * A car sold only as part of a set is not a thing you buy on its own, so the
 * lists that are about *what you can buy* leave it out and show the box
 * instead. The casting still exists, still has its own page, and is still
 * reachable through the pack that contains it — it simply does not stand in the
 * open pretending to be a separate purchase.
 */
export function packMemberIds(members: Record<string, string[]>): Set<string> {
  const out = new Set<string>();
  for (const ids of Object.values(members)) {
    for (const id of ids) out.add(id.trim().toUpperCase());
  }
  return out;
}

/** Whether this row is a car that only comes inside a box. */
export const isPackMember = (car: Pick<Diecast, "catalogId">, memberIds: Set<string>) =>
  memberIds.has((car.catalogId || "").trim().toUpperCase());

/** What one owned row counts as: the cars in the box, or 1 for a single car. */
export function unitsOf(car: Pick<Diecast, "catalogId">, sizes: Map<string, number>): number {
  const id = (car.catalogId || "").trim().toUpperCase();
  if (!id) return 1;
  return sizes.get(id) ?? 1;
}

/** Whether this row is a box rather than a single car. */
export const isPackCar = (car: Pick<Diecast, "catalogId">, sizes: Map<string, number>) =>
  sizes.has((car.catalogId || "").trim().toUpperCase());

/**
 * The count for a list of owned rows under the chosen reading.
 *
 * With no sizes — nothing flagged a pack yet, or the catalogue has not arrived —
 * both readings give the same answer, which is the count the app has always
 * shown.
 */
export function countCars(
  cars: Pick<Diecast, "catalogId">[],
  mode: CountMode,
  sizes: Map<string, number>,
): number {
  if (mode === "items" || sizes.size === 0) return cars.length;
  let total = 0;
  for (const car of cars) total += unitsOf(car, sizes);
  return total;
}

/**
 * What the "Multipack" section header says while it is shut, so a group nobody
 * opens still tells you whether this casting is a box and how much of it has
 * been listed.
 */
export function packBadge(isPack: boolean, size: number, listed: number): string {
  if (!isPack) return "single car";
  if (!size) return listed ? `${listed} listed` : "no size set";
  return `${listed} of ${size} listed`;
}
