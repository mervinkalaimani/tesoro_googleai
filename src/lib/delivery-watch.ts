import { canBeLate, normaliseStatus } from "@/lib/status";
import type { Diecast } from "@/lib/types";

/**
 * Which deliveries need a word from you today.
 *
 * Only a day-precise expected date counts. Rows carried over from the sheet can
 * hold "Mar 2027" in that column, and treating a month note as a promised day
 * would mark half a pre-order list late on the 2nd.
 *
 * That imprecision is also what makes On Hold work: "I want this one in March"
 * is a month, never a day, so a held car can carry a plan without it ever
 * becoming a deadline it can miss.
 */

/** "YYYY-MM-DD" in the viewer's own time zone — the day it is where they are. */
export function localDay(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The expected day, or null when the column holds anything less precise. */
export function expectedDay(car: Diecast): string | null {
  const m = (car.expectedDate || "").trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Late, worked out rather than stored.
 *
 * Ordered or In Transit — never On Hold, where the date passing is you keeping
 * it held — with a promised day already behind us. This used to be a status you
 * set by hand, which meant it drifted: all three cars marked "Delayed" when the
 * statuses were merged were in fact expecting a date in the future.
 */
export function isLate(car: Diecast, today = localDay()): boolean {
  const day = expectedDay(car);
  return canBeLate(car.status) && day !== null && day < today;
}

/** Coming and due today. */
export function isDueToday(car: Diecast, today = localDay()): boolean {
  return canBeLate(car.status) && expectedDay(car) === today;
}

/** Late with no day on it at all — there is nothing left to chase it against. */
export function needsNewDate(car: Diecast, today = localDay()): boolean {
  if (normaliseStatus(car.status) !== "Ordered" && normaliseStatus(car.status) !== "In Transit") {
    return false;
  }
  const day = expectedDay(car);
  return day === null || day < today;
}

export type DeliveryGroup = {
  /** Shipping ID when the cars share one, otherwise the single car's id. */
  key: string;
  shippingId: string;
  cars: Diecast[];
  seller: string;
  day: string | null;
};

/**
 * One notice per parcel, not per car. A shipment of eight cars arriving today
 * is one thing to deal with, and eight identical rows would bury everything
 * else in the panel.
 */
export function groupDeliveries(cars: Diecast[]): DeliveryGroup[] {
  const groups = new Map<string, DeliveryGroup>();
  for (const car of cars) {
    const shippingId = (car.shippingId || "").trim();
    const key = shippingId ? `ship:${shippingId.toLowerCase()}` : `car:${car.id}`;
    const g = groups.get(key);
    if (g) g.cars.push(car);
    else
      groups.set(key, {
        key,
        shippingId,
        cars: [car],
        seller: car.seller || "",
        day: expectedDay(car),
      });
  }
  return [...groups.values()].sort((a, b) => (a.day || "").localeCompare(b.day || ""));
}
