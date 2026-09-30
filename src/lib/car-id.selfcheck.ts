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

// What still separates one entry from another, price or no price: the spine.
assert.equal(findCatalogEntry({ ...asFiled, mrp: 450, model: "Corvette" }), undefined);
assert.equal(findCatalogEntry({ ...asFiled, mrp: 450, brand: "Matchbox" }), undefined);

// A colour is not one of them. The same tooling comes out red as well as
// yellow, and it is the same casting: the colour joins the entry's list rather
// than minting a second ID for it.
assert.equal(
  findCatalogEntry({ ...asFiled, mrp: 450, colour: "Red" })?.car_id,
  ENTRY.car_id,
  "a colour the entry has not seen is still this casting",
);
assert.equal(catalogIdFor({ ...asFiled, mrp: 450, colour: "Red" }), ENTRY.car_id);

// Where the catalogue does hold one casting under two entries, the colour is
// what picks between them.
setCatalogIdEntries([
  { ...ENTRY, car_id: "010506-01-0000-1", colour: "Yellow" },
  { ...ENTRY, car_id: "010506-01-0000-2", colour: "Red", colours: ["Red", "Crimson"] },
]);
assert.equal(
  findCatalogEntry({ ...asFiled, mrp: 450, colour: "Red" })?.car_id,
  "010506-01-0000-2",
  "the entry that knows this colour wins",
);
assert.equal(
  findCatalogEntry({ ...asFiled, mrp: 450, colour: "Crimson" })?.car_id,
  "010506-01-0000-2",
  "including a colour a collector added to it",
);
assert.equal(
  findCatalogEntry({ ...asFiled, mrp: 450, colour: "Green" })?.car_id,
  "010506-01-0000-1",
  "and a colour neither knows takes the first rather than a new entry",
);
setCatalogIdEntries([ENTRY]);

// Spelling is not identity. The catalogue holds 713 entries reading "Hot
// Wheels" and an exported spreadsheet says "Hotwheels"; comparing the strings
// meant every one of those rows filed a second casting.
setCatalogIdEntries([{ ...ENTRY, brand: "Hot Wheels" }]);
assert.equal(
  findCatalogEntry({ ...asFiled, brand: "Hotwheels", mrp: 450 })?.car_id,
  ENTRY.car_id,
  "Hotwheels is Hot Wheels",
);
assert.equal(
  findCatalogEntry({ ...asFiled, brand: "  hot-wheels ", mrp: 450 })?.car_id,
  ENTRY.car_id,
  "nor is punctuation or shouting",
);
setCatalogIdEntries([ENTRY]);

// A field only argues when both sides state it. The entry carries no car
// number and no series, so a row that states one is still that casting —
// a column nobody filled in is not evidence of a different car.
assert.equal(findCatalogEntry({ ...asFiled, mrp: 450, carNumber: "113" })?.car_id, ENTRY.car_id);
assert.equal(
  findCatalogEntry({ ...asFiled, mrp: 450, series: "Fast & Furious" })?.car_id,
  ENTRY.car_id,
);

// But two stated values that disagree are two castings.
setCatalogIdEntries([{ ...ENTRY, car_number: "112", series: "Muscle Mania" }]);
assert.equal(findCatalogEntry({ ...asFiled, mrp: 450, carNumber: "113" }), undefined);
assert.equal(findCatalogEntry({ ...asFiled, mrp: 450, series: "Fast & Furious" }), undefined);
assert.equal(
  findCatalogEntry({ ...asFiled, mrp: 450, carNumber: "112", series: "Muscle Mania" })?.car_id,
  ENTRY.car_id,
);
setCatalogIdEntries([ENTRY]);

// A car already carrying its catalogue id keeps it, whatever the price says.
assert.equal(
  catalogIdFor({ ...asFiled, mrp: 9999, catalogId: ENTRY.car_id } as Parameters<
    typeof catalogIdFor
  >[0]),
  ENTRY.car_id,
);

console.log("car-id: all checks passed");
