/**
 * Cars whose casting has not reached the catalogue yet.
 *
 *   npx esbuild src/lib/held.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert/strict";

import { heldCars, heldClosing, heldLabel, hoursLeft } from "@/lib/held";
import type { Diecast } from "@/lib/types";

const NOW = new Date("2026-09-27T12:00:00Z");
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3600_000).toISOString();

const car = (id: string, pending?: string) =>
  ({ id, name: id, catalogPendingAt: pending }) as Diecast;

const fresh = car("fresh", hoursAgo(2));
const closing = car("closing", hoursAgo(23.5));
const overdue = car("overdue", hoursAgo(25));
const free = car("free");

// Only held cars, soonest to be filed first.
assert.deepEqual(
  heldCars([fresh, overdue, free, closing]).map((c) => c.id),
  ["overdue", "closing", "fresh"],
);

// A car nobody is holding has no clock at all.
assert.equal(hoursLeft(free, NOW), null);

// 22 hours left on one held two hours ago.
assert.equal(Math.round(hoursLeft(fresh, NOW) ?? 0), 22);

// The last hour is the warning, and past due stays in it: the sweep runs every
// ten minutes, so an overdue row is still editable and still worth shouting
// about.
assert.deepEqual(
  heldClosing([fresh, closing, overdue, free], NOW).map((c) => c.id),
  ["overdue", "closing"],
);

assert.equal(heldLabel(fresh, NOW), "in 22 hours");
assert.equal(heldLabel(closing, NOW), "in 30 minutes");
assert.equal(heldLabel(overdue, NOW), "any minute now");
assert.equal(heldLabel(free, NOW), "");

// A stamp that will not parse is not a hold, rather than a car stuck for ever.
assert.equal(hoursLeft(car("broken", "not a date"), NOW), null);
assert.deepEqual(heldClosing([car("broken", "not a date")], NOW), []);

console.log("held: a car waiting on the catalogue knows how long it has.");
