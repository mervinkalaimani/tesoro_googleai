import type { Diecast } from "@/lib/types";
import { parseDMY } from "@/lib/format";

/**
 * Shipping IDs, ported from the sheet formula:
 *
 *   prefix = UPPER(LEFT(seller_without_spaces, 3) & RIGHT(seller_without_spaces, 1))
 *   eff_date = arrival date, or the order date when the car has not arrived
 *   is_po = arrival date empty AND order date present
 *   rank = COUNTUNIQUE(eff_dates for the same seller and same is_po, up to eff_date)
 *   id = prefix & IF(is_po, "/PO/", "/") & TEXT(rank, "00")
 *
 * So every car a seller shipped on one day shares an ID, and the number counts
 * distinct shipping days for that seller — pre-orders numbered separately.
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

/** The seller, effective date and pre-order flag a car contributes. */
function effectiveOf(car: Diecast): Effective | null {
  const seller = (car.seller || "").trim();
  if (!seller) return null;

  const arrival = (car.date || "").trim();
  const ordered = (car.orderDate || "").trim();
  const isPo = !arrival && Boolean(ordered);

  const token = dayToken(arrival || ordered);
  if (!token) return null;

  return { seller, token, isPo };
}

/** "First Cry" -> "FIRY"; "Shlok Agarwal" -> "SHLL". */
export function sellerPrefix(seller: string): string {
  const clean = (seller || "").replace(/\s+/g, "");
  if (!clean) return "";
  return (clean.slice(0, 3) + clean.slice(-1)).toUpperCase();
}

/**
 * The shipping ID `car` should carry, given the collection it belongs to.
 * Returns "" when the car has no seller or no usable date, matching the
 * formula's IF(seller="", "").
 */
export function shippingIdFor(car: Diecast, all: Diecast[]): string {
  const self = effectiveOf(car);
  if (!self) return "";

  const sellerKey = self.seller.toLowerCase();

  // COUNTUNIQUE over same seller, same pre-order state, date at or before this one.
  const earlier = new Set<string>();
  for (const other of all) {
    const e = effectiveOf(other);
    if (!e) continue;
    if (e.seller.toLowerCase() !== sellerKey) continue;
    if (e.isPo !== self.isPo) continue;
    if (e.token <= self.token) earlier.add(e.token);
  }

  const rank = earlier.size || 1;
  return `${sellerPrefix(self.seller)}${self.isPo ? "/PO/" : "/"}${String(rank).padStart(2, "0")}`;
}

/** True when the fields the ID is derived from differ between two versions. */
export function shippingInputsChanged(a: Diecast, b: Diecast): boolean {
  return (
    (a.seller || "").trim() !== (b.seller || "").trim() ||
    (a.date || "").trim() !== (b.date || "").trim() ||
    (a.orderDate || "").trim() !== (b.orderDate || "").trim()
  );
}
