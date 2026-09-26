import type { CatalogCar } from "@/lib/catalog";
import type { Diecast } from "@/lib/types";
import { isPreOrder } from "@/lib/status";

/**
 * Castings that have just come out, and the pre-orders of yours they settle.
 *
 * Nobody pushes any of this. The database flips a casting to Released the first
 * time anyone's copy of it moves off PO (see the tesoro_raw_release_on_status
 * trigger), and every other collector's app works out what that means for them
 * from the catalogue they already hold. No new table, no message queue, and no
 * way for one person's notification to go missing because a send failed.
 *
 * The cost of that choice is that the news is as fresh as the catalogue read,
 * which is every visibility change and every refresh — minutes, not seconds.
 * For "your pre-order shipped" that is soon enough.
 */

/**
 * How long a release stays news. Past this it is just a car in the catalogue.
 *
 * A week. Three weeks kept castings on the shelf that collectors had already
 * bought, unboxed and shelved, which is the opposite of what a shelf called
 * "Recently Released" is for.
 */
export const RELEASED_WINDOW_DAYS = 7;

export type Release = {
  entry: CatalogCar;
  /** When it released. */
  at: Date;
  /** Whole days since, 0 being today. */
  daysAgo: number;
};

/** A release you are waiting on: the casting, and your own row still on PO. */
export type WaitingRelease = Release & { car: Diecast };

const parse = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const daysSince = (d: Date, now: Date) => Math.floor((now.getTime() - d.getTime()) / 86_400_000);

/**
 * Everything released inside the window, newest first.
 *
 * An entry with no `released_at` is skipped however recently it was edited: it
 * was released before the flip existed, or by an admin typing the status in by
 * hand, and neither is a date we can honestly put on screen.
 */
export function recentReleases(
  catalog: CatalogCar[],
  withinDays = RELEASED_WINDOW_DAYS,
  now = new Date(),
): Release[] {
  const out: Release[] = [];
  for (const entry of catalog) {
    if (entry.release_status === "Pre Order") continue;
    const at = parse(entry.released_at);
    if (!at) continue;
    const daysAgo = daysSince(at, now);
    // Negative means a clock disagreement rather than a release from the
    // future, so it counts as today rather than being thrown away.
    if (daysAgo > withinDays) continue;
    out.push({ entry, at, daysAgo: Math.max(0, daysAgo) });
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/**
 * Your pre-orders whose casting has now shipped for somebody.
 *
 * This is the one that earns a notification: the shop has the car, your row
 * still says PO, and there is probably a balance to settle before it moves.
 * Matched on Catalog ID alone — make and model are not an identity, and
 * guessing wrong here would tell you to go and pay for the wrong car.
 */
export function releasesYouAreWaitingOn(
  cars: Diecast[],
  catalog: CatalogCar[],
  withinDays = RELEASED_WINDOW_DAYS,
  now = new Date(),
): WaitingRelease[] {
  const released = new Map<string, Release>();
  for (const r of recentReleases(catalog, withinDays, now)) {
    released.set(r.entry.car_id.trim().toUpperCase(), r);
  }
  if (released.size === 0) return [];

  const out: WaitingRelease[] = [];
  for (const car of cars) {
    if (!isPreOrder(car.status)) continue;
    const id = (car.catalogId || "").trim().toUpperCase();
    if (!id) continue;
    const hit = released.get(id);
    if (hit) out.push({ ...hit, car });
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/**
 * released_at is a moment; the form's date field is a day. The two have to
 * agree about which day a moment falls on — here, not in UTC, or a release
 * stamped late in the evening reads as the day before.
 */
export function releasedOnInput(stamp?: string | null): string {
  if (!stamp) return "";
  // A bare day is already what the field wants. Parsing it would read it as UTC
  // midnight, which is the day before west of Greenwich — so the date somebody
  // had just typed would jump back one as they typed it.
  const bare = /^\d{4}-\d{2}-\d{2}$/.exec(stamp.trim());
  if (bare) return bare[0];
  const d = new Date(stamp);
  if (Number.isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** A typed day back the other way, as the moment that day began here. */
export function releasedOnStamp(day?: string | null): string | null {
  if (!day) return null;
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "Released today" / "Released yesterday" / "Released 6 days ago". */
export function releasedLabel(daysAgo: number): string {
  if (daysAgo <= 0) return "Released today";
  if (daysAgo === 1) return "Released yesterday";
  return `Released ${daysAgo} days ago`;
}
