/**
 * Which catalogue entries are the same casting in another box.
 *
 * Every case here is a real pair from the catalogue. The ones that must club
 * are a casting filed twice; the ones that must not are two castings whose
 * twin was filed without its variant, which is what makes a blank variant
 * unsafe to match on by itself.
 *
 *   npx esbuild src/lib/casting-siblings.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert/strict";

import { castingSiblings, siblingLabels } from "@/lib/catalog";
import type { CatalogCar } from "@/lib/catalog";

const car = (p: Partial<CatalogCar> & { car_id: string }): CatalogCar =>
  ({
    brand: "Mini GT",
    make: "Cadillac",
    model: "V-Series",
    variant: "",
    colour: "Grey",
    assortment: "Box",
    series: "",
    sub_series: "",
    car_number: "",
    mrp: 1849,
    name: "Cadillac V-Series",
    ...p,
  }) as CatalogCar;

/** The ids `entry` clubs with, its own included. */
const clubbed = (entry: CatalogCar, all: CatalogCar[]) =>
  castingSiblings(entry, all)
    .map((c) => c.car_id)
    .sort();

// Filed twice, once with the variant typed and once without, same number.
const cadillacA = car({ car_id: "A", variant: "R #40 Dex", car_number: "1372" });
const cadillacB = car({ car_id: "B", variant: "", car_number: "1372" });
assert.deepEqual(clubbed(cadillacA, [cadillacA, cadillacB]), ["A", "B"]);
assert.deepEqual(clubbed(cadillacB, [cadillacA, cadillacB]), ["A", "B"]);

// The same casting in two packages, agreeing about the variant.
const urusBlister = car({
  car_id: "U1",
  make: "Lamborghini",
  model: "Urus",
  variant: "Performante",
  car_number: "1381",
  assortment: "Blister",
});
const urusBox = car({ ...urusBlister, car_id: "U2", assortment: "Box" } as Partial<CatalogCar> & {
  car_id: string;
});
assert.deepEqual(clubbed(urusBlister, [urusBlister, urusBox]), ["U1", "U2"]);

// Two castings, one filed without its variant, different numbers. Must not club.
const defender90 = car({
  car_id: "D90",
  make: "Land Rover",
  model: "Defender",
  variant: "90",
  car_number: "1307",
});
const defenderBlank = car({
  car_id: "D--",
  make: "Land Rover",
  model: "Defender",
  variant: "",
  car_number: "1309",
});
assert.deepEqual(clubbed(defender90, [defender90, defenderBlank]), ["D90"]);

// Neither carries a number, and the variants disagree: still two castings.
const countach = car({ car_id: "C1", make: "Lamborghini", model: "Countach", variant: "" });
const countach500s = car({ car_id: "C2", make: "Lamborghini", model: "Countach", variant: "500s" });
assert.deepEqual(clubbed(countach, [countach, countach500s]), ["C1"]);

// A shared number cannot reach across colours.
const greyOne = car({ car_id: "G", colour: "Grey", car_number: "999" });
const redOne = car({ car_id: "R", colour: "Red", car_number: "999" });
assert.deepEqual(clubbed(greyOne, [greyOne, redOne]), ["G"]);

// The entry itself comes first, whatever the rest sort to.
const [first] = castingSiblings(cadillacB, [cadillacA, cadillacB]);
assert.equal(first.car_id, "B");

console.log("catalog: a casting clubs with its other boxes, and with nothing else.");

// Naming the boxes. The assortment alone when it tells them apart, then the
// number, then the ID's middle block for a casting filed twice in one box.
const labels = (list: CatalogCar[]) => siblingLabels(list).map((o) => o.label);

assert.deepEqual(labels([urusBlister, urusBox]), ["Blister", "Box"]);

// The real pair: one casting, filed twice in the same box under the same
// number, so only the IDs differ and only the IDs can say which is which.
const boxed = [
  car({ car_id: "0F1S07-0G-0B02-1", variant: "R #40 Dex", car_number: "1372" }),
  car({ car_id: "0F1S07-0G-1F01-1", variant: "", car_number: "1372" }),
];
assert.deepEqual(labels(boxed), ["Box · 0B02", "Box · 1F01"]);

const twoQube = [
  car({ car_id: "Q1", assortment: "Qube Carz", car_number: "QZ009" }),
  car({ car_id: "Q2", assortment: "Qube Carz", car_number: "QZ008" }),
];
assert.deepEqual(labels(twoQube), ["Qube Carz #QZ009", "Qube Carz #QZ008"]);
