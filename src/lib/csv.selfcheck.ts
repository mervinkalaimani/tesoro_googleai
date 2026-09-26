/**
 * What an import adds and what it replaces.
 *
 *   npx esbuild src/lib/csv.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert/strict";

import { importDelta } from "@/lib/csv";
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
