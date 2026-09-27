/**
 * Shipping IDs and order IDs: which parcel, and which purchase.
 *
 *   npx esbuild src/lib/ids.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert/strict";

import { shippingIdTable, sellerPrefix } from "@/lib/shipping-id";
import { orderIdTable } from "@/lib/order-id";
import type { Diecast } from "@/lib/types";

const car = (p: Partial<Diecast> & { id: string }): Diecast =>
  ({
    name: p.id,
    seller: "Aniruddh",
    status: "In Hand",
    date: "",
    orderDate: "",
    expectedDate: "",
    ...p,
  }) as Diecast;

const ship = (all: Diecast[]) => Object.fromEntries(shippingIdTable(all));
const order = (all: Diecast[]) => Object.fromEntries(orderIdTable(all));

// The prefix: first three and the last, spaces removed.
assert.equal(sellerPrefix("Aniruddh"), "ANIH");
assert.equal(sellerPrefix("Shlok Agarwal"), "SHLL");

// ── Shipping: one seller, one day, one parcel ────────────────────────────────

// Two cars bought months apart, arriving together, are one parcel.
const juneBuy = car({ id: "A", orderDate: "2026-06-30", date: "2026-09-10" });
const augBuy = car({ id: "B", orderDate: "2026-08-24", date: "2026-09-10" });
assert.deepEqual(ship([juneBuy, augBuy]), { A: "ANIH/01", B: "ANIH/01" });

// A pre-order joins the same run rather than a /PO/ one of its own, and is
// still placed by its order date -- a release date moves, a shipment does not.
const po = car({ id: "P", status: "PO", orderDate: "2026-07-01", expectedDate: "2027-03-10" });
assert.deepEqual(ship([juneBuy, augBuy, po]), { A: "ANIH/02", B: "ANIH/02", P: "ANIH/01" });

// A car in flight is placed by the day it is due, not the day it was bought.
const flying = car({
  id: "F",
  status: "In Transit",
  orderDate: "2026-05-01",
  expectedDate: "2026-09-10",
});
assert.equal(ship([juneBuy, flying])["F"], "ANIH/01");

// An expected date that is not a day -- "Mar 2027" from the old sheet -- is not
// a promise, so the order date stands in.
const vague = car({
  id: "V",
  status: "Ordered",
  orderDate: "2026-04-02",
  expectedDate: "Mar 2027",
});
assert.equal(ship([vague])["V"], "ANIH/01");

// No seller, no ID. A normal state, not a gap.
assert.equal(ship([car({ id: "N", seller: "", date: "2026-09-10" })])["N"], "");

// ── Orders: which purchase, counted per month ────────────────────────────────

assert.deepEqual(order([juneBuy, augBuy]), { A: "ANIH/26/06/01", B: "ANIH/26/08/01" });

// Same seller, same month, two days: two orders, numbered in date order.
const jul1 = car({ id: "J1", orderDate: "2026-07-02" });
const jul2 = car({ id: "J2", orderDate: "2026-07-20" });
const jul2b = car({ id: "J3", orderDate: "2026-07-20" });
assert.deepEqual(order([jul2, jul1, jul2b]), {
  J1: "ANIH/26/07/01",
  J2: "ANIH/26/07/02",
  J3: "ANIH/26/07/02",
});

// A pre-order is tagged and counted in its own run, so its number cannot read
// as one of the ordinary orders.
const poJul = car({ id: "PJ", status: "PO", orderDate: "2026-07-02", expectedDate: "2027-03-10" });
assert.deepEqual(order([jul1, poJul]), { J1: "ANIH/26/07/01", PJ: "ANIH/26/07/PO/01" });

// A pre-order that has arrived is not one any more: it rejoins the main run.
const landed = car({ id: "L", status: "PO", orderDate: "2026-07-02", date: "2026-09-10" });
assert.equal(order([landed])["L"], "ANIH/26/07/01");

// The count resets with the month, which is what putting the month in it is for.
const aug = car({ id: "AU", orderDate: "2026-08-03" });
assert.deepEqual(order([jul1, jul2, aug]), {
  J1: "ANIH/26/07/01",
  J2: "ANIH/26/07/02",
  AU: "ANIH/26/08/01",
});

console.log("ids: one parcel per seller-day, one order per seller-month-day.");
