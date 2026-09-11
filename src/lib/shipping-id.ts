import type { Diecast } from "@/lib/types";
import { parseDMY } from "@/lib/format";
import { isPreOrder } from "@/lib/status-order";

/**
 * Shipping IDs, ported from the sheet formula:
 *
 *   prefix   = UPPER(LEFT(seller_without_spaces, 3) & RIGHT(seller_without_spaces, 1))
 *   eff_date = arrival date, or the order date when the car has not arrived
 *   is_po    = the car is a pre-order
 *   rank     = COUNTUNIQUE(eff_dates for the same seller and same is_po, up to eff_date)
 *   id       = prefix & IF(is_po, "/PO/", "/") & TEXT(rank, "00")
 *
 * So every car a seller shipped on one day shares an ID, and the number counts
 * that seller's distinct shipping days — pre-orders counted separately.
 *
 * One departure from the sheet, and it is deliberate. There `is_po` was
 * `(date="") * (o_date<>"")` — no arrival date yet — which is true of every car
 * that has not turned up, not just the pre-ordered ones. A parcel in transit and
 * a car waiting at a seller both came out tagged /PO/, which is what the transit
 * tracker was showing. The tag means what it says here: a pre-order is a car
 * paid for before it existed, and the status column is what records that.
 *
 * The rank is a property of the whole collection, not of one car: a car dated
 * between two existing orders takes a number that every later order of that
 * seller's then has to shift up by one. The sheet recalculated all of it on
 * every keystroke. Here `shippingIdTable` does the same in one pass, and
 * `resyncShippingIds` narrows the writing to the groups a change disturbed.
 */

/** Day-resolution token used both for equality and for ordering. */
function dayToken(value: string | undefined | null): string | null {
  const d = parseDMY(value ?? "");
  if (!d) return null;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

type Effective = { seller: string; token: string; isPo: boolean };

/**
 * Statuses meaning the car is on its way, with a delivery date to be grouped by.
 *
 * These are the ones whose effective date is the *expected* date rather than the
 * order date. A parcel is one parcel: the cars inside it were very often bought
 * on different days, and dating them by when each was ordered split a single
 * shipment into as many IDs as it had order dates. What they share is the day it
 * turns up, which is what the expected date records.
 *
 * "Delayed" is not in here on purpose — say the word if it should be. Pre orders
 * are not either: their expected date is a release date that moves around, and
 * the /PO/ run counts the days orders were *placed*.
 */
const IN_FLIGHT = new Set(["transit", "out for delivery", "waiting"]);

const statusKey = (status: string | undefined | null) =>
  (status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, " ");

/**
 * A delivery date has to name a day. The expected date is a text column and the
 * app writes YYYY-MM-DD into it, but rows carried over from the sheet can hold a
 * note like "Mar 2027" — and parseDMY will turn that into a concrete date, which
 * would rank a whole shipment by a day nobody promised. Anything that is not
 * day-precision falls through to the order date instead.
 *
 * This is also what keeps the app and the rebuild migration in step: the SQL
 * casts "Expected Date" only when it matches this shape, and a looser rule here
 * had the two of them numbering the same car differently.
 */
const isDayPrecise = (value: string) => /^\d{4}-\d{2}-\d{2}/.test(value.trim());

/** The seller, effective date and pre-order flag a car contributes. */
function effectiveOf(car: Diecast): Effective | null {
  const seller = (car.seller || "").trim();
  if (!seller) return null;

  const arrival = (car.date || "").trim();
  const ordered = (car.orderDate || "").trim();
  const expected = (car.expectedDate || "").trim();
  // A car that has arrived is not a pre-order whatever its status still says,
  // which is what keeps an order moving out of the /PO/ run when it lands.
  const isPo = isPreOrder(car.status) && !arrival;

  // An arrival date always wins: the car is here, and the day it came is the
  // day its shipment landed. Failing that, an in-flight car is dated by when it
  // is due, and everything else by when it was ordered.
  const inFlight = IN_FLIGHT.has(statusKey(car.status)) && isDayPrecise(expected);
  const token = dayToken(arrival || (inFlight ? expected : ordered));
  if (!token) return null;

  return { seller, token, isPo };
}

/**
 * The numbering sequence a car belongs to. Two cars share a sequence when they
 * share a seller and are both pre-orders or both not — which is exactly the
 * FILTER in the formula.
 */
function groupKey(e: Effective): string {
  return `${e.seller.toLowerCase()}|${e.isPo ? "1" : "0"}`;
}

/** The sequence key for a car, or null when it contributes to none. */
export function shippingGroupOf(car: Diecast): string | null {
  const e = effectiveOf(car);
  return e ? groupKey(e) : null;
}

/** "First Cry" -> "FIRY"; "Shlok Agarwal" -> "SHLL". */
export function sellerPrefix(seller: string): string {
  const clean = (seller || "").replace(/\s+/g, "");
  if (!clean) return "";
  return (clean.slice(0, 3) + clean.slice(-1)).toUpperCase();
}

/**
 * The ID every car in `all` should carry, keyed by car ID. One pass over the
 * collection rather than one pass per car: ranking by hand is O(n²), and at
 * 1,500 cars that is two million comparisons to answer a question about one.
 *
 * A car with no seller, or with no date to place it, maps to "" — the formula's
 * IF(seller="", "").
 */
export function shippingIdTable(all: Diecast[]): Map<string, string> {
  const effective = new Map<string, Effective>();
  const daysByGroup = new Map<string, Set<string>>();

  for (const car of all) {
    const e = effectiveOf(car);
    if (!e) continue;
    effective.set(car.id, e);
    const key = groupKey(e);
    let days = daysByGroup.get(key);
    if (!days) {
      days = new Set<string>();
      daysByGroup.set(key, days);
    }
    days.add(e.token);
  }

  // COUNTUNIQUE(… eff_dates <= eff_date) is the position of this day in the
  // sorted list of that sequence's distinct days. Tokens are YYYY-MM-DD, so
  // they sort as text.
  const rankByGroup = new Map<string, Map<string, number>>();
  for (const [key, days] of daysByGroup) {
    const ranks = new Map<string, number>();
    [...days].sort().forEach((token, i) => ranks.set(token, i + 1));
    rankByGroup.set(key, ranks);
  }

  const out = new Map<string, string>();
  for (const car of all) {
    const e = effective.get(car.id);
    if (!e) {
      out.set(car.id, "");
      continue;
    }
    const rank = rankByGroup.get(groupKey(e))?.get(e.token) ?? 1;
    out.set(
      car.id,
      `${sellerPrefix(e.seller)}${e.isPo ? "/PO/" : "/"}${String(rank).padStart(2, "0")}`,
    );
  }
  return out;
}

/**
 * The shipping ID `car` should carry, given the collection it belongs to.
 * Returns "" when the car has no seller or no usable date.
 */
export function shippingIdFor(car: Diecast, all: Diecast[]): string {
  return shippingIdTable(all).get(car.id) ?? "";
}

/**
 * Every car in `all` whose stored ID disagrees with the formula, as rows ready
 * to write. The whole collection — this is the rebuild.
 */
export function allShippingIdFixes(all: Diecast[]): Diecast[] {
  const table = shippingIdTable(all);
  const out: Diecast[] = [];
  for (const car of all) {
    const want = table.get(car.id) ?? "";
    if ((car.shippingId || "").trim() !== want) out.push({ ...car, shippingId: want });
  }
  return out;
}

/**
 * The same, narrowed to the numbering sequences that `touched` belongs to.
 *
 * Pass both versions of anything that changed — the car as it was and as it now
 * is. A car moving seller or date leaves one sequence and joins another, and
 * both have to be renumbered: the one it left closes the gap, the one it joined
 * makes room.
 *
 * Deliberately not the whole collection. Every edit would otherwise write back
 * any row whose stored ID had drifted from the formula for reasons of its own,
 * turning a single favourite toggle into a hundred-row save. Correcting all of
 * them is its own action — see `allShippingIdFixes`.
 */
export function resyncShippingIds(all: Diecast[], touched: Diecast[]): Diecast[] {
  const keys = new Set<string>();
  for (const car of touched) {
    const key = shippingGroupOf(car);
    if (key) keys.add(key);
  }
  if (keys.size === 0) return [];

  const table = shippingIdTable(all);
  const out: Diecast[] = [];
  for (const car of all) {
    const key = shippingGroupOf(car);
    if (!key || !keys.has(key)) continue;
    const want = table.get(car.id) ?? "";
    if ((car.shippingId || "").trim() !== want) out.push({ ...car, shippingId: want });
  }
  return out;
}

/**
 * True when the fields the ID is derived from differ between two versions.
 *
 * Status and the expected date are in here because the ID now depends on both:
 * status decides whether the car is dated by its delivery or its order and
 * whether it is a pre-order, and the expected date is that delivery date. Left
 * out, moving an order's ETA would leave its cars on numbers derived from an ETA
 * they no longer have.
 */
export function shippingInputsChanged(a: Diecast, b: Diecast): boolean {
  return (
    (a.seller || "").trim() !== (b.seller || "").trim() ||
    (a.date || "").trim() !== (b.date || "").trim() ||
    (a.orderDate || "").trim() !== (b.orderDate || "").trim() ||
    (a.expectedDate || "").trim() !== (b.expectedDate || "").trim() ||
    (a.status || "").trim() !== (b.status || "").trim()
  );
}
