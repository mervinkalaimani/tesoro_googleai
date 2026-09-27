import type { Diecast } from "@/lib/types";

/** How long an imported car's casting is kept out of the shared catalogue. */
export const HOLD_HOURS = 24;

/** When the hold stops being something to mention and becomes a warning. */
export const WARN_HOURS = 1;

const MS_HOUR = 3600_000;

/** When this car's casting is filed, or null if it is not being held. */
export function filesAt(car: Diecast): Date | null {
  if (!car.catalogPendingAt) return null;
  const held = new Date(car.catalogPendingAt);
  if (Number.isNaN(held.getTime())) return null;
  return new Date(held.getTime() + HOLD_HOURS * MS_HOUR);
}

/**
 * Hours until this car's casting is filed. Negative once it is due — the sweep
 * runs every ten minutes, so a car can be past its hour and still held.
 */
export function hoursLeft(car: Diecast, now = new Date()): number | null {
  const due = filesAt(car);
  if (!due) return null;
  return (due.getTime() - now.getTime()) / MS_HOUR;
}

/** The cars still waiting, soonest first. */
export function heldCars(cars: Diecast[]): Diecast[] {
  return cars
    .filter((c) => Boolean(c.catalogPendingAt))
    .sort((a, b) => (a.catalogPendingAt || "").localeCompare(b.catalogPendingAt || ""));
}

/**
 * The ones about to be filed, which is the last moment to correct them.
 *
 * Past due counts: the row is still editable until the sweep actually takes it,
 * and saying nothing about a car that is overdue would be the one case where
 * the warning is most urgent.
 */
export function heldClosing(cars: Diecast[], now = new Date()): Diecast[] {
  return heldCars(cars).filter((c) => {
    const left = hoursLeft(c, now);
    return left !== null && left <= WARN_HOURS;
  });
}

/** "in 6 hours", "in 40 minutes", "any minute now". */
export function heldLabel(car: Diecast, now = new Date()): string {
  const left = hoursLeft(car, now);
  if (left === null) return "";
  if (left <= 0) return "any minute now";
  if (left < 1) {
    const mins = Math.max(1, Math.round(left * 60));
    return `in ${mins} ${mins === 1 ? "minute" : "minutes"}`;
  }
  const hours = Math.round(left);
  return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
}
