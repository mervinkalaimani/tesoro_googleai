import type { Diecast } from "@/lib/types";

/**
 * Owning the same casting more than once.
 *
 * 92 castings in the collection are owned twice or more — 214 rows between
 * them, so the same Lightning McQueen fills six lines of My Cars and the list
 * reads as a filing error rather than as six real purchases. One line per
 * casting instead, marked 6×, showing the copy bought most recently.
 *
 * Nothing is hidden: the row expands, and the car's own page lists every
 * purchase. This is about what the list says at a glance.
 */

/**
 * The day a copy was bought.
 *
 * The order date, or the received date when there isn't one — 7 of the repeated
 * rows came off the sheet with only a received date, and a blank sorting as
 * "the beginning of time" would put the oldest-looking copy at the top of a
 * group it doesn't lead.
 */
export const boughtOn = (c: Diecast) => (c.orderDate || "").trim() || (c.date || "").trim();

/** True when this copy's date is standing in for an order date it never had. */
export const boughtOnIsReceived = (c: Diecast) => !(c.orderDate || "").trim();

export type CopyGroup = {
  /** The copy the collapsed row speaks for: the most recently bought. */
  lead: Diecast;
  /** Every copy, newest purchase first. `lead` is the first of them. */
  copies: Diecast[];
  /** How many, so a row can say 6×. Always at least 1. */
  n: number;
  /** What all the copies cost together, which is what the row shows as Spent. */
  total: number;
};

/**
 * What identifies "the same casting".
 *
 * The catalogue ID, which is the only thing that means it exactly — two rows
 * agreeing on make and model can still be different colours of it. A row
 * without one is its own group, never merged with another blank: a missing ID
 * is an unknown casting, not a shared one.
 */
const castingKey = (c: Diecast) => {
  const id = (c.catalogId || "").trim().toUpperCase();
  return id ? `cat:${id}` : `row:${c.id}`;
};

/**
 * Group a list of cars by casting, newest purchase first within each.
 *
 * Runs on the list *after* filtering, never before, so the count always
 * describes what you are actually looking at: 3× under the In Hand chip means
 * three in hand, never three of which one is still on order. That also saves
 * the grouping from needing any status rules of its own.
 */
export function groupCopies(cars: Diecast[]): CopyGroup[] {
  const by = new Map<string, Diecast[]>();
  for (const c of cars) {
    const k = castingKey(c);
    const hit = by.get(k);
    if (hit) hit.push(c);
    else by.set(k, [c]);
  }

  const out: CopyGroup[] = [];
  for (const copies of by.values()) {
    const sorted =
      copies.length === 1
        ? copies
        : [...copies].sort((a, b) => boughtOn(b).localeCompare(boughtOn(a)));
    out.push({
      lead: sorted[0],
      copies: sorted,
      n: sorted.length,
      total: sorted.reduce((s, c) => s + (c.spent || 0), 0),
    });
  }
  return out;
}

/** One line per parcel, not per copy — a box of five is one purchase, not five. */
export type Purchase = {
  /** "YYYY-MM-DD", or "" when the row carries no date at all. */
  day: string;
  shippingId: string;
  seller: string;
  /** How many copies arrived on this day in this parcel. */
  n: number;
  total: number;
  /** The day is the received date, because no order date was recorded. */
  estimated: boolean;
};

/**
 * The purchase history of one casting, newest first.
 *
 * Grouped by day *and* shipment because the raw rows repeat: five of the six
 * Twin Tags came in one parcel on one day, and a plain row-per-copy list prints
 * "23 Jun 2026 · AMAN/05" five times over.
 */
export function purchaseHistory(copies: Diecast[]): Purchase[] {
  const by = new Map<string, Purchase>();
  for (const c of copies) {
    const day = boughtOn(c);
    const shippingId = (c.shippingId || "").trim();
    const k = `${day}|${shippingId}`;
    const hit = by.get(k);
    if (hit) {
      hit.n += 1;
      hit.total += c.spent || 0;
    } else {
      by.set(k, {
        day,
        shippingId,
        seller: (c.seller || "").trim(),
        n: 1,
        total: c.spent || 0,
        estimated: boughtOnIsReceived(c),
      });
    }
  }
  return [...by.values()].sort((a, b) => b.day.localeCompare(a.day));
}
