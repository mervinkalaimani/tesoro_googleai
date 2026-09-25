/**
 * The one rule the KPI band has to keep: In hand and In transit are the first
 * two tiles, and neither is ever drawn narrower than a tile behind it.
 *
 *   npx esbuild src/components/kpi.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 *
 * The old rule handed the leftover width to the end of the list, so a band of
 * five drew Late at half a row and In hand at a third of one.
 */
import assert from "node:assert";

import { bentoSpan } from "@/components/kpi";

const cols = (i: number, total: number) => Number(bentoSpan(i, total).replace("col-span-", ""));

for (let total = 1; total <= 12; total++) {
  const spans = Array.from({ length: total }, (_, i) => cols(i, total));

  // Nothing behind the first two is wider than they are.
  const priority = spans.slice(0, Math.min(2, total));
  const rest = spans.slice(Math.min(2, total));
  for (const r of rest) {
    for (const p of priority) {
      assert.ok(p >= r, `total ${total}: a later tile is ${r} wide, a priority tile only ${p}`);
    }
  }

  // Every row adds up to the full six columns, so the grid never ends on a hole.
  let row = 0;
  for (const s of spans) {
    row += s;
    if (row >= 6) {
      assert.equal(row, 6, `total ${total}: a row adds up to ${row}, not 6`);
      row = 0;
    }
  }
  assert.equal(row, 0, `total ${total}: ${row} columns left dangling on the last row`);
}

// The shapes worth naming, so a change to them is deliberate.
assert.deepEqual(
  Array.from({ length: 5 }, (_, i) => bentoSpan(i, 5)),
  ["col-span-3", "col-span-3", "col-span-2", "col-span-2", "col-span-2"],
);
assert.deepEqual(
  Array.from({ length: 7 }, (_, i) => bentoSpan(i, 7)),
  [
    "col-span-6",
    "col-span-2",
    "col-span-2",
    "col-span-2",
    "col-span-2",
    "col-span-2",
    "col-span-2",
  ],
);

console.log("kpi: band spans keep In hand and In transit the widest, and every row fills.");
