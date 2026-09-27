/**
 * Whether a draft is worth keeping, and worth a badge.
 *
 *   npx esbuild src/lib/draft-content.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert/strict";

import { bulkDraftHasContent, carDraftHasContent, hasTypedContent } from "@/lib/draft-content";

// The blank form as the dialog builds it, saved yesterday. Nothing was typed;
// the order date is simply the day it was opened. This is the draft that kept
// the badge lit for a week.
const blankFormFromYesterday = {
  make: "",
  model: "",
  variant: "",
  year: "",
  colour: "",
  type: "",
  series: "",
  subSeries: "",
  carNumber: "",
  caseNumber: "",
  brand: "",
  assortment: "",
  size: "1:64",
  spent: "",
  mrp: "",
  shippingCost: "",
  payment: "Pending",
  seller: "",
  status: "Ordered",
  paid: "",
  balance: 0,
  transitInfo: "",
  deliveryPartner: "",
  trackingId: "",
  orderDate: "2026-09-26",
  expectedDate: "",
  official: false,
  rarity: "Normal",
  carCondition: "",
  cardCondition: "",
  carRating: 0,
  cardRating: 0,
  favourite: false,
  imageUrl: "",
  displayName: "",
};

assert.equal(carDraftHasContent({ form: blankFormFromYesterday, step: 1 }), false);
assert.equal(carDraftHasContent({ form: { ...blankFormFromYesterday, make: "Porsche" } }), true);
// Even one word counts, wherever it is.
assert.equal(carDraftHasContent({ form: { ...blankFormFromYesterday, seller: "J&R" } }), true);
assert.equal(carDraftHasContent({ form: { ...blankFormFromYesterday, spent: 120 } }), true);
// A flag somebody ticked is content; the ones that default to false are not.
assert.equal(carDraftHasContent({ form: { ...blankFormFromYesterday, favourite: true } }), true);
assert.equal(carDraftHasContent(null), false);
assert.equal(carDraftHasContent({}), false);

// Bulk: an empty table with its default shared fields is not content, a typed
// cell in any row is, and so is a shared field.
const emptyRow = { key: "r1", make: "", model: "", brand: "", seller: "" };
assert.equal(bulkDraftHasContent({ rows: [emptyRow, emptyRow], shared: {} }), false);
assert.equal(bulkDraftHasContent({ rows: [emptyRow, { ...emptyRow, model: "Civic" }] }), true);
assert.equal(bulkDraftHasContent({ rows: [emptyRow], shared: { seller: "Amazon" } }), true);
assert.equal(bulkDraftHasContent(null), false);

// The row key is bookkeeping, not typing — otherwise every blank row counts.
assert.equal(hasTypedContent({ key: "abc" }), false);

console.log("draft-content: a draft counts when somebody typed in it, not when a day passed.");
