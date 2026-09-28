/**
 * The one field a pre-order's window is picked in.
 *
 * Run: npx esbuild src/lib/expected-by.selfcheck.ts --bundle --format=esm
 *      --platform=node --alias:@=./src --outfile=.sc.mjs && node .sc.mjs
 */
import assert from "node:assert/strict";

import { expectedByOptions, expectedByValue } from "@/lib/date-utils";

const now = new Date(2026, 8, 28); // 28 September 2026

const plain = expectedByOptions("", now);
assert.equal(plain.length, 24);
assert.deepEqual(plain[0], { value: "2026-09-01", label: "Sep 2026" });
// Two years out, and the year rolls over inside the window.
assert.deepEqual(plain[3], { value: "2026-12-01", label: "Dec 2026" });
assert.deepEqual(plain[4], { value: "2027-01-01", label: "Jan 2027" });
assert.deepEqual(plain[23], { value: "2028-08-01", label: "Aug 2028" });

// A day in the middle of a month becomes the 1st of it.
assert.equal(expectedByValue("2027-06-10"), "2027-06-01");
assert.equal(expectedByValue(""), "");
assert.equal(expectedByValue("not a date"), "");

// Whatever the row already says survives opening the form, even from outside
// the window — otherwise the Select would show blank and the first save would
// quietly move the date.
const far = expectedByOptions("2030-03-14", now);
assert.equal(far.length, 25);
assert.deepEqual(far[0], { value: "2030-03-01", label: "Mar 2030" });
// One already inside the window is not repeated.
assert.equal(expectedByOptions("2027-01-01", now).length, 24);

console.log("expected-by.selfcheck ok");
