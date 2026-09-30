/**
 * What counts as another copy of the same thing.
 */
import { groupCopies } from "@/lib/copies";
import type { Diecast } from "@/lib/types";

let checks = 0;
function ok(cond: boolean, what: string) {
  checks++;
  if (!cond) throw new Error(`FAILED: ${what}`);
}

const car = (id: string, catalogId: string, assortment: string, orderDate = "") =>
  ({ id, catalogId, assortment, orderDate, spent: 100 }) as unknown as Diecast;

const groups = (cars: Diecast[]) =>
  groupCopies(cars)
    .map((g) => g.n)
    .sort();

ok(
  groups([
    car("1", "0F1H02-01-0000-2", "Blister"),
    car("2", "0F1H02-01-0000-2", "Blister"),
  ]).join() === "2",
  "two of the same casting in the same box are one row, twice",
);
ok(
  groups([car("1", "0F1H02-01-0000-2", "Blister"), car("2", "0F1H02-0G-0000-2", "Box")]).join() ===
    "1,1",
  "the Box and the Blister are two things to own, not one owned twice",
);
ok(
  groups([car("1", "0F1H02-01-0000-2", "Blister"), car("2", "0F1H02-01-0000-2", "Box")]).join() ===
    "1,1",
  "and still two when they were filed under the same entry",
);
ok(
  groups([car("1", "", "Blister"), car("2", "", "Blister")]).join() === "1,1",
  "no catalogue ID is an unknown casting, never a shared one",
);

// The row the group speaks for is the most recent purchase.
const lead = groupCopies([
  car("old", "X", "Box", "2026-01-01"),
  car("new", "X", "Box", "2026-06-01"),
])[0];
ok(lead.lead.id === "new", "the newest purchase leads the group");
ok(lead.total === 200, "and the row carries what both copies cost");

console.log(`ok — ${checks} checks`);
