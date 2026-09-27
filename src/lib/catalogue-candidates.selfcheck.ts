/**
 * Which catalogue entries a car might be.
 *
 *   npx esbuild src/lib/catalogue-candidates.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert/strict";

import { catalogueCandidates } from "@/lib/catalogue-candidates";
import type { CatalogCar } from "@/lib/catalog";
import type { Diecast } from "@/lib/types";

const entry = (p: Partial<CatalogCar> & { car_id: string }): CatalogCar =>
  ({
    brand: "Mini GT",
    make: "Porsche",
    model: "911 GT3 R",
    assortment: "Box",
    series: "",
    sub_series: "",
    car_number: "",
    mrp: 1549,
    name: "Porsche 911 GT3 R",
    colour: "Red",
    ...p,
  }) as CatalogCar;

const car = (p: Partial<Diecast> = {}): Diecast =>
  ({
    id: "X",
    name: "Porsche 911 GT3 R",
    brand: "Mini GT",
    make: "Porsche",
    model: "911 GT3 R",
    colour: "Red",
    carNumber: "",
    series: "",
    subSeries: "",
    ...p,
  }) as Diecast;

const ids = (list: ReturnType<typeof catalogueCandidates>) => list.map((c) => c.car.car_id);

// Brand, make and model agreeing is enough to be offered — three fields at
// weight 3 is nine, well past the floor.
const gt3r = entry({ car_id: "A" });
assert.deepEqual(ids(catalogueCandidates(car(), [gt3r])), ["A"]);

// The entry the car already points at is not a candidate for re-linking.
assert.deepEqual(ids(catalogueCandidates(car({ catalogId: "A" }), [gt3r])), []);

// Two blanks are not agreement: a nearly empty row must not match everything.
const empty = car({ brand: "", make: "", model: "", colour: "", carNumber: "" });
assert.deepEqual(ids(catalogueCandidates(empty, [gt3r])), []);

// Brand alone (weight 3) is below the floor of 4.
const otherMake = car({ make: "Ferrari", model: "F40", colour: "Yellow" });
assert.deepEqual(ids(catalogueCandidates(otherMake, [gt3r])), []);

// Better agreement sorts first: the entry sharing the collector number wins.
const numbered = entry({ car_id: "B", car_number: "1224", colour: "White" });
const plain = entry({ car_id: "C" });
const withNumber = car({ carNumber: "1224", colour: "White" });
assert.deepEqual(ids(catalogueCandidates(withNumber, [plain, numbered])), ["B", "C"]);

// A typed search overrides the fields — this is how a car gets linked to an
// entry its own details disagree with, which is the point of linking by hand.
const unrelated = entry({
  car_id: "D",
  brand: "Tomica",
  make: "Ferrari",
  model: "512 TR",
  name: "Tomica Ferrari 512 TR Red",
  colour: "Red",
});
assert.deepEqual(ids(catalogueCandidates(car(), [gt3r, unrelated], { query: "tomica" })), ["D"]);

// And a search that matches nothing returns nothing, rather than falling back
// to the field scoring and showing rows nobody asked for.
assert.deepEqual(ids(catalogueCandidates(car(), [gt3r, unrelated], { query: "lamborghini" })), []);

console.log("catalogue-candidates: a car is offered the entries it might be, best first.");

// Variant is what tells two copies of one casting apart, so an entry that
// agrees on it outranks one that does not.
const dtm = entry({ car_id: "V1", variant: "DTM 2025 #90", colour: "Green" });
const leMans = entry({ car_id: "V2", variant: "Le Mans 24H 2024 #91", colour: "Green" });
const mine2 = car({ variant: "Le Mans 24H 2024 #91", colour: "Green" });
assert.deepEqual(ids(catalogueCandidates(mine2, [dtm, leMans])), ["V2", "V1"]);

console.log("catalogue-candidates: the variant decides between two of one casting.");
