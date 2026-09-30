/**
 * The two rules a casting-in-several-boxes form has to get right: a box already
 * named is not offered again, and two new boxes never claim the same ID.
 *
 * Run: npx esbuild src/lib/assortments.selfcheck.ts --bundle --format=esm
 *      --platform=node --alias:@=./src --outfile=.sc.mjs && node .sc.mjs
 */
import assert from "node:assert/strict";

import {
  ensureAssortment,
  isKeptAssortment,
  remainingAssortments,
  setAssortments,
  type Assortment,
} from "@/lib/assortments";
import { assortmentOptionsFor } from "@/lib/car-options";
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

// The kept vocabulary carries no brand of its own -- every row in
// tesoro_assortments has the column blank -- so narrowing has to come from what
// each brand is actually sold in.
const keep = (name: string, sort: number): Assortment => ({
  id: name,
  name,
  brand: "",
  sort,
  retired: false,
});
setAssortments(
  ["Mainline", "Premium", "Blister", "Qube Carz", "Sky Busters"].map((n, i) => keep(n, i)),
);

const pool = [
  { brand: "Mini GT", assortment: "Blister" },
  { brand: "Mini GT", assortment: "Qube Carz" },
  { brand: "Matchbox", assortment: "Sky Busters" },
  // The same maker, spelled both ways it is spelled in the table.
  { brand: "Hotwheels", assortment: "Mainline" },
  { brand: "Hot Wheels", assortment: "Premium" },
] as never[];

assert.deepEqual(assortmentOptionsFor(pool, "Mini GT"), ["Blister", "Qube Carz"]);
assert.deepEqual(assortmentOptionsFor(pool, "Matchbox"), ["Sky Busters"]);
// "Hot Wheels" and "Hotwheels" are one maker, so their boxes are one list.
assert.deepEqual(assortmentOptionsFor(pool, "Hot Wheels"), ["Mainline", "Premium"]);
assert.deepEqual(assortmentOptionsFor(pool, "Hotwheels"), ["Mainline", "Premium"]);
// A brand nothing has been filed under has nothing to narrow by, so it gets the
// whole vocabulary rather than an empty dropdown.
assert.deepEqual(assortmentOptionsFor(pool, "Tomica"), [
  "Mainline",
  "Premium",
  "Blister",
  "Qube Carz",
  "Sky Busters",
]);

// A box is a name somebody keeps, not a by-product of typing one.
setAssortments([
  { id: "1", name: "Mainline", brand: "", sort: 0, retired: false },
  { id: "2", name: "Qube Carz", brand: "Mini GT", sort: 1, retired: false },
] as Assortment[]);

assert.equal(isKeptAssortment("Mainline"), true);
assert.equal(isKeptAssortment("  mainline "), true, "spelling it quietly is spelling it");
assert.equal(isKeptAssortment("Qube Carz", "Mini GT"), true);
assert.equal(
  isKeptAssortment("Qube Carz", "Matchbox"),
  false,
  "a brand's own line is not every brand's",
);
assert.equal(isKeptAssortment("Mainline", "Matchbox"), true, "a box with no brand is anybody's");
assert.equal(isKeptAssortment("Moving Parts"), false);
assert.equal(isKeptAssortment(""), false);

// Nothing is filed for a name the list already holds, and nothing at all
// before the list has loaded -- an empty list is not evidence a box is new.
assert.equal(await ensureAssortment("Mainline", "Matchbox"), false);
setAssortments([]);
assert.equal(await ensureAssortment("Something New", "Matchbox"), false);

console.log("assortments.selfcheck ok");
