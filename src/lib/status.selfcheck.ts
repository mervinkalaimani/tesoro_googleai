/**
 * The rules in status.ts and copies.ts that are cheap to break and expensive
 * to notice. No test framework in this project, so: plain asserts, run it.
 *
 *   npx esbuild src/lib/status.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert/strict";

import { groupCopies, purchaseHistory } from "@/lib/copies";
import { canBeLate, normaliseStatus, statusRank, STATUSES } from "@/lib/status";
import { isLate } from "@/lib/delivery-watch";
import type { Diecast } from "@/lib/types";

const car = (p: Partial<Diecast>) => ({ id: "x", ...p }) as Diecast;

// Every spelling that has ever been in the Status column lands on one of six.
for (const s of [
  "Available",
  "Available (In Hand)",
  "Out for Delivery",
  "Transit",
  "Transit (In Transit)",
  "Waiting",
  "On Hold",
  "Delayed",
  "PO",
  "Pre Order",
  "Pre-Order",
  "Lost",
  "Wrong Item",
  "ISO",
]) {
  assert.ok(
    (STATUSES as readonly string[]).includes(normaliseStatus(s)),
    `"${s}" did not normalise to one of the six (got "${normaliseStatus(s)}")`,
  );
}

// The merges, exactly as the migration writes them.
assert.equal(normaliseStatus("Available"), "In Hand");
assert.equal(normaliseStatus("Out for Delivery"), "In Transit");
assert.equal(normaliseStatus("Waiting"), "Ordered");
assert.equal(normaliseStatus("Delayed"), "Ordered");
assert.equal(normaliseStatus("On Hold"), "On Hold");
assert.equal(normaliseStatus("Pre Order"), "PO");
assert.equal(normaliseStatus("Wrong Item"), "ISO");
assert.equal(normaliseStatus("Lost"), "ISO");

// An unplanned value shows itself rather than silently becoming In Hand.
assert.equal(normaliseStatus("Marinated"), "Marinated");
assert.equal(normaliseStatus(""), "");
assert.equal(statusRank("Marinated"), STATUSES.length);

// Late is derived, and derived from the right two statuses.
const overdue = { expectedDate: "2026-01-01" };
assert.equal(isLate(car({ status: "Ordered", ...overdue }), "2026-06-01"), true);
assert.equal(isLate(car({ status: "In Transit", ...overdue }), "2026-06-01"), true);

// The reason On Hold survived the merge into Ordered: folded in, every held
// car would have flagged late forever.
assert.equal(canBeLate("On Hold"), false);
assert.equal(isLate(car({ status: "On Hold", ...overdue }), "2030-01-01"), false);

// "I want this one in March" is a month, so it can never become a deadline.
assert.equal(isLate(car({ status: "Ordered", expectedDate: "Mar 2027" }), "2030-01-01"), false);

const mcqueen = [
  car({
    id: "1",
    catalogId: "020T0J",
    orderDate: "2024-09-07",
    shippingId: "TEMU/04",
    spent: 572.22,
  }),
  car({
    id: "2",
    catalogId: "020T0J",
    orderDate: "2025-05-20",
    shippingId: "TEMU/06",
    spent: 595.98,
  }),
  car({ id: "3", catalogId: "020T0J", orderDate: "2025-05-20", shippingId: "TEMU/06", spent: 600 }),
  car({ id: "4", catalogId: "020T0J", orderDate: "2025-05-26", shippingId: "TEMU/06", spent: 600 }),
];

const [mc] = groupCopies(mcqueen);
assert.equal(mc.n, 4);
assert.equal(mc.lead.id, "4", "the group is led by the most recently bought copy");
assert.ok(Math.abs(mc.total - 2368.2) < 0.01, `group total was ${mc.total}`);

// A missing catalogue ID is an unknown casting, never a shared one.
assert.equal(groupCopies([car({ id: "a" }), car({ id: "b" })]).length, 2);

// Five copies in one parcel are one purchase line, not five identical ones.
assert.deepEqual(
  purchaseHistory(mcqueen).map((l) => [l.day, l.n]),
  [
    ["2025-05-26", 1],
    ["2025-05-20", 2],
    ["2024-09-07", 1],
  ],
);

// A sheet-era row with no order date sorts and displays on its received date.
const [z] = groupCopies([
  car({ id: "1", catalogId: "Z", orderDate: "", date: "2026-06-08" }),
  car({ id: "2", catalogId: "Z", orderDate: "2026-07-30" }),
]);
assert.equal(z.lead.id, "2");
assert.equal(purchaseHistory(z.copies)[1].estimated, true);

console.log("status + copies: all checks passed");
