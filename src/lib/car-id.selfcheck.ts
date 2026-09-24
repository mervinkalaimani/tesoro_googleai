/**
 * What makes two cars the same catalogue entry. Ten duplicate pairs were filed
 * because a price counted, so the price is checked here. No test framework in
 * this project, so: plain asserts, run it.
 *
 *   npx esbuild src/lib/car-id.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert/strict";

import { catalogIdFor, findCatalogEntry, setCatalogIdEntries } from "@/lib/car-id";

const ENTRY = {
  car_id: "010506-01-0000-1",
  brand: "CCA",
  make: "Chevrolet",
  model: "Camaro",
  assortment: "",
  series: "",
  sub_series: "",
  car_number: "",
  mrp: 450,
  variant: "SS",
  colour: "Yellow",
};

setCatalogIdEntries([ENTRY]);

const asFiled = {
  brand: "CCA",
  make: "Chevrolet",
  model: "Camaro",
  assortment: "",
  series: "",
  subSeries: "",
  carNumber: "",
  variant: "SS",
  colour: "Yellow",
};

// The bug this exists for: your own price must not fork a second entry.
assert.equal(findCatalogEntry({ ...asFiled, mrp: 450 })?.car_id, ENTRY.car_id);
assert.equal(findCatalogEntry({ ...asFiled, mrp: 400 })?.car_id, ENTRY.car_id);
assert.equal(findCatalogEntry({ ...asFiled, mrp: 0 })?.car_id, ENTRY.car_id);
assert.equal(findCatalogEntry({ ...asFiled, mrp: null })?.car_id, ENTRY.car_id);

// And through the path Add a car actually takes.
assert.equal(catalogIdFor({ ...asFiled, mrp: 400 }), ENTRY.car_id);

// What still separates one entry from another, price or no price.
assert.equal(findCatalogEntry({ ...asFiled, mrp: 450, colour: "Red" }), undefined);
assert.equal(findCatalogEntry({ ...asFiled, mrp: 450, model: "Corvette" }), undefined);
assert.equal(findCatalogEntry({ ...asFiled, mrp: 450, brand: "Hot Wheels" }), undefined);
assert.equal(findCatalogEntry({ ...asFiled, mrp: 450, carNumber: "113" }), undefined);
assert.equal(findCatalogEntry({ ...asFiled, mrp: 450, series: "Fast & Furious" }), undefined);

// A car already carrying its catalogue id keeps it, whatever the price says.
assert.equal(
  catalogIdFor({ ...asFiled, mrp: 9999, catalogId: ENTRY.car_id } as Parameters<
    typeof catalogIdFor
  >[0]),
  ENTRY.car_id,
);

console.log("car-id: all checks passed");
