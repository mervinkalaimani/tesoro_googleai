import assert from "node:assert/strict";
import { ownedCandidates } from "./taste";

const c = (
  car_id: string,
  brand: string,
  make: string,
  image_url: string | null,
  created_at = "2026-01-01",
) => ({ car_id, brand, make, image_url, created_at });
const rows = [
  c("A", "Hot Wheels", "Porsche", null),
  c("B", "Hot Wheels", "Nissan", "x.jpg"),
  c("C", "Matchbox", "Porsche", "y.jpg"),
  c("D", "Matchbox", "Ford", null),
  c("E", "Hot Wheels", "Porsche", "z.jpg", "2026-05-01"),
];
const ids = (t: { brands: string[]; makes: string[] }, owned: string[] = []) =>
  ownedCandidates(rows, t, new Set(owned)).map((r) => r.car_id);

// A brand alone: only that brand, photographed first, newest first.
assert.deepEqual(ids({ brands: ["hot wheels"], makes: [] }), ["E", "B", "A"]);
// A make alone: that make from any brand.
assert.deepEqual(ids({ brands: [], makes: ["Porsche"] }), ["E", "C", "A"]);
// Both: that make by that brand, nothing else.
assert.deepEqual(ids({ brands: ["Hot Wheels"], makes: ["Porsche"] }), ["E", "A"]);
// Owned ones never come back.
assert.deepEqual(ids({ brands: ["Hot Wheels"], makes: [] }, ["E"]), ["B", "A"]);
// Nothing picked: everything with a photo.
assert.deepEqual(ids({ brands: [], makes: [] }), ["E", "B", "C"]);
console.log("taste: ok");
