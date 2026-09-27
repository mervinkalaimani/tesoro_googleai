/**
 * What an import adds and what it replaces.
 *
 *   npx esbuild src/lib/csv.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert/strict";

import {
  buildCsv,
  generateDiecastCsvTemplate,
  importDelta,
  parseCsvRows,
  parseCsvToDiecast,
} from "@/lib/csv";
import { CAR_CSV_COLUMNS } from "@/lib/car-columns";
import type { Diecast } from "@/lib/types";

const car = (id: string, name = id) => ({ id, name }) as Diecast;

// A file of cars the collection has never seen: all additions, nothing to restore.
assert.deepEqual(importDelta([car("A"), car("B")], []), { created: ["A", "B"], overwritten: [] });

// Re-importing an edited export: the row replaces what is there, and undoing it
// has to hand back the version that was replaced, not delete the car.
const mine = car("A", "Cadillac V-Series");
const edited = car("A", "Cadillac V-Series R #40 Dex");
const delta = importDelta([edited, car("C")], [mine]);
assert.deepEqual(delta.created, ["C"]);
assert.deepEqual(
  delta.overwritten.map((c) => c.name),
  ["Cadillac V-Series"],
);

// One id twice in the same file is still one car, counted once.
assert.deepEqual(importDelta([car("A"), car("A")], []), { created: ["A"], overwritten: [] });

console.log("csv: an import names what it adds and what it replaces.");

// The template ships with examples, and a file built from it usually still has
// them. They are not cars, and nobody should have to delete them first.
const template = generateDiecastCsvTemplate();
const parsed = parseCsvToDiecast(template);
assert.equal(parsed.cars.length, 0, "a template imports as no cars at all");
assert.equal(parsed.samples, 10, "and says how many examples it ignored");

// A real row beside them survives. Written through the column list rather than
// typed out, so reordering the columns cannot quietly move Honda into Model.
const ownRow = {
  make: "Honda",
  model: "Civic",
  year: "1990",
  brand: "Hot Wheels",
  assortment: "Mainline",
  carNumber: "12/250",
  colour: "Red",
  type: "Coupe",
  size: "1/64",
  spent: 120,
  mrp: 110,
  payment: "Paid",
  paid: 120,
  status: "In Hand",
  seller: "Roy J&R Kicks",
  rarity: "Normal",
} as unknown as Diecast;
const withReal = `${template}\n${buildCsv([ownRow], CAR_CSV_COLUMNS).split("\n")[1]}`;
const mixed = parseCsvToDiecast(withReal);
assert.equal(mixed.samples, 10);
assert.deepEqual(
  mixed.cars.map((c) => c.model),
  ["Civic"],
);

// The examples cover the shapes people get wrong: the three kinds of pack, a
// chase, a treasure hunt, a pre-order with money owed.
const rows = parseCsvRows(template).slice(1);
const at = CAR_CSV_COLUMNS.findIndex((c) => c.key === "assortment");
const assortments = rows.map((r) => r[at]);
for (const kind of ["2 Pack", "5 Pack", "Team Transport"]) {
  assert.ok(assortments.includes(kind), `template shows a ${kind}`);
}

console.log("csv: the template teaches, and the importer ignores what it taught with.");
