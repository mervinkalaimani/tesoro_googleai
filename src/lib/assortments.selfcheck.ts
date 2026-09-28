/**
 * The two rules a casting-in-several-boxes form has to get right: a box already
 * named is not offered again, and two new boxes never claim the same ID.
 *
 * Run: npx esbuild src/lib/assortments.selfcheck.ts --bundle --format=esm
 *      --platform=node --alias:@=./src --outfile=.sc.mjs && node .sc.mjs
 */
import assert from "node:assert/strict";

import { remainingAssortments } from "@/lib/assortments";
import { generateCatalogCarId, setCatalogIdEntries } from "@/lib/car-id";

const ALL = ["Mainline", "Premium", "Moving Parts", "Blister"];

// The row's own value stays; the others' values go.
assert.deepEqual(remainingAssortments(ALL, ["Mainline", "Premium"], "Mainline"), [
  "Mainline",
  "Moving Parts",
  "Blister",
]);
// Nothing named yet: everything is on offer.
assert.deepEqual(remainingAssortments(ALL, ["", ""], ""), ALL);
// Case and padding are not a second assortment.
assert.deepEqual(remainingAssortments(ALL, [" premium "], ""), [
  "Mainline",
  "Moving Parts",
  "Blister",
]);

// Two boxes of one casting, filed in the same save. The second call is told
// what the first was given, which is the whole reason `others` exists.
setCatalogIdEntries([]);
const casting = {
  brand: "Matchbox",
  make: "Ford",
  model: "Bronco",
  series: "",
  subSeries: "",
  carNumber: "11",
};
const a = generateCatalogCarId({ ...casting, assortment: "Mainline", mrp: 179 });
const b = generateCatalogCarId({ ...casting, assortment: "Moving Parts", mrp: 399 }, [
  { id: a, car: { ...casting, assortment: "Mainline", mrp: 179 } },
]);
assert.notEqual(a, b, "two assortments of one casting must not share an ID");

console.log("assortments.selfcheck ok");
