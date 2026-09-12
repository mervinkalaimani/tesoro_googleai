import type { Diecast } from "@/lib/types";
import { parseDMY } from "@/lib/format";
import { sellerPrefix } from "@/lib/shipping-id";

/**
 * Order IDs: which order a car was bought in.
 *
 *   prefix = UPPER(LEFT(seller_without_spaces, 3) & RIGHT(seller_without_spaces, 1))
 *   id     = prefix & "-" & YYYY & "-" & MM & "-" & TEXT(rank, "000")
 *
 * The shipping ID answers "which parcel did this turn up in". This answers the
 * other half — "which time I bought from them did this come from" — and the two
 * are genuinely different questions: one seller's single order is very often
 * split across three parcels, and one parcel just as often carries cars bought
 * weeks apart.
 *
 * Three departures from the shipping ID, all of them following from that:
 *
 *   The date is always the order date. Never the arrival, never the ETA — an
 *   order happened on the day it was placed, whatever became of it afterwards.
 *
 *   Pre-orders are not a separate run. A shipping ID splits them out because a
 *   pre-order arrives by a different route; an order is an order, and splitting
 *   the runs would give the same seller two SHLL-2026-06-001s in one month.
 *
 *   The count resets every month, which is what putting YYYY-MM in the ID is
 *   for. A seller's third order of June is -003 and their first of July is -001
 *   again, so the ID says when without anyone having to look it up.
 *
 * Cars ordered from one seller on one day share an ID — that is what makes the
 * pre-orders page's "Group by Order ID" show you orders rather than cars. A car
 * with no seller, or no readable order date, has no order ID at all, and that
 * is a normal state rather than a gap to be filled.
 */

/** Day-resolution token, used both for equality and for ordering. */
function dayToken(value: string | undefined | null): string | null {
  const d = parseDMY(value ?? "");
  if (!d) return null;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

type Effective = { seller: string; token: string; month: string };

/** The seller and order day a car contributes, or null when it contributes none. */
function effectiveOf(car: Diecast): Effective | null {
  const seller = (car.seller || "").trim();
  if (!seller) return null;
  const token = dayToken(car.orderDate);
  if (!token) return null;
  // "2026-06-14" -> "2026-06". The ID's own month, and the reset boundary.
  return { seller, token, month: token.slice(0, 7) };
}

/** Two cars share a numbering run when they share a seller and a month. */
function groupKey(e: Effective): string {
  return `${e.seller.toLowerCase()}|${e.month}`;
}

/** The run a car belongs to, or null when it belongs to none. */
export function orderGroupOf(car: Diecast): string | null {
  const e = effectiveOf(car);
  return e ? groupKey(e) : null;
}

/**
 * The ID every car in `all` should carry, keyed by car ID. One pass over the
 * collection — same reasoning as `shippingIdTable`: ranking each car against
 * every other is O(n²), and at 1,500 cars that is two million comparisons to
 * answer a question about one.
 */
export function orderIdTable(all: Diecast[]): Map<string, string> {
  const effective = new Map<string, Effective>();
  const daysByGroup = new Map<string, Set<string>>();

  for (const car of all) {
    const e = effectiveOf(car);
    if (!e) continue;
    effective.set(car.id, e);
    let days = daysByGroup.get(groupKey(e));
    if (!days) {
      days = new Set<string>();
      daysByGroup.set(groupKey(e), days);
    }
    days.add(e.token);
  }

  // The rank of a day is its position among that run's distinct days. Tokens
  // are YYYY-MM-DD, so they sort as text.
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
    out.set(car.id, `${sellerPrefix(e.seller)}-${e.month}-${String(rank).padStart(3, "0")}`);
  }
  return out;
}

/** The order ID `car` should carry, given the collection it belongs to. */
export function orderIdFor(car: Diecast, all: Diecast[]): string {
  return orderIdTable(all).get(car.id) ?? "";
}

/**
 * Every car whose stored ID disagrees with the formula, as rows ready to write.
 * The whole collection — this is the rebuild.
 */
export function allOrderIdFixes(all: Diecast[]): Diecast[] {
  const table = orderIdTable(all);
  const out: Diecast[] = [];
  for (const car of all) {
    const want = table.get(car.id) ?? "";
    if ((car.orderId || "").trim() !== want) out.push({ ...car, orderId: want });
  }
  return out;
}

/**
 * The same, narrowed to the runs `touched` belongs to.
 *
 * Pass both versions of anything that changed — as it was and as it now is. A
 * car moving seller or order date leaves one run and joins another, and both
 * have to be renumbered: the one it left closes the gap, the one it joined
 * makes room.
 */
export function resyncOrderIds(all: Diecast[], touched: Diecast[]): Diecast[] {
  const keys = new Set<string>();
  for (const car of touched) {
    const key = orderGroupOf(car);
    if (key) keys.add(key);
  }
  if (keys.size === 0) return [];

  const table = orderIdTable(all);
  const out: Diecast[] = [];
  for (const car of all) {
    const key = orderGroupOf(car);
    if (!key || !keys.has(key)) continue;
    const want = table.get(car.id) ?? "";
    if ((car.orderId || "").trim() !== want) out.push({ ...car, orderId: want });
  }
  return out;
}

/**
 * True when the two fields the ID is derived from differ between two versions.
 * Short, because the ID depends on very little: who sold it, and when it was
 * bought.
 */
export function orderInputsChanged(a: Diecast, b: Diecast): boolean {
  return (
    (a.seller || "").trim() !== (b.seller || "").trim() ||
    (a.orderDate || "").trim() !== (b.orderDate || "").trim()
  );
}
