import assert from "node:assert/strict";
import { ownedCandidates } from "./taste";

const c = (car_id: string, brand: string, image_url: string | null, created_at = "2026-01-01") => ({
  car_id,
  brand,
  make: "",
  image_url,
  created_at,
});
const rows = [
  c("A", "Hot Wheels", null),
  c("B", "Hot Wheels", "x.jpg"),
  c("C", "Matchbox", "y.jpg"),
  c("D", "Matchbox", null),
  c("E", "Hot Wheels", "z.jpg", "2026-05-01"),
];
const ids = (t: { brands: string[]; makes: string[] }, owned: string[] = []) =>
  ownedCandidates(rows, t, new Set(owned)).map((r) => r.car_id);

// Liked with a photo (newest first), liked without, then the rest that has a photo.
assert.deepEqual(ids({ brands: ["hot wheels"], makes: [] }), ["E", "B", "A", "C"]);
// Owned ones never come back.
assert.deepEqual(ids({ brands: ["Hot Wheels"], makes: [] }, ["E"]), ["B", "A", "C"]);
// No taste: everything with a photo.
assert.deepEqual(ids({ brands: [], makes: [] }), ["E", "B", "C"]);
console.log("taste: ok");
