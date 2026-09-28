/**
 * Which other boxes a casting is sold in, as the two forms ask it.
 *
 * Run: npx esbuild src/lib/box-siblings.selfcheck.ts --bundle --format=esm
 *      --platform=node --alias:@=./src --outfile=.sc.mjs && node .sc.mjs
 */
import assert from "node:assert/strict";

import { boxSiblings, castingKey } from "@/lib/casting-group";
import type { CatalogCar } from "@/lib/catalog";

const entry = (over: Partial<CatalogCar>): CatalogCar =>
  ({
    car_id: "X",
    brand: "CCA",
    make: "Chevrolet",
    model: "Camaro",
    variant: "SS",
    series: "",
    sub_series: "",
    car_number: "",
    assortment: "Box",
    mrp: 330,
    ...over,
  }) as CatalogCar;

// The four CCA Camaro SS entries as the catalogue actually holds them: three
// with no collector number, one with S10-02.
const numbered = entry({ car_id: "010506-0G-0000-3", car_number: "S10-02" });
const catalog = [
  entry({ car_id: "010506-01-0000-1", assortment: "Blister", mrp: 450 }),
  entry({ car_id: "010506-0G-0000-1", mrp: 400 }),
  entry({ car_id: "010506-0G-0000-2" }),
  numbered,
];

// On the strict key the numbered one is a casting of its own, which is why the
// edit form showed one box where the catalogue holds four.
assert.notEqual(castingKey(numbered), castingKey(catalog[1]));
assert.deepEqual(
  boxSiblings(numbered, catalog).map((c) => c.car_id),
  ["010506-01-0000-1", "010506-0G-0000-1", "010506-0G-0000-2"],
);
// And it reads the same way round.
assert.equal(boxSiblings(catalog[1], catalog).length, 3);

// A blank speaks for nobody, but a stated difference still separates.
const other = entry({ car_id: "Y", car_number: "S10-09" });
assert.deepEqual(boxSiblings(numbered, [numbered, other]), []);
// Brand, make and model are not optional: an empty row is not everybody's box.
assert.deepEqual(boxSiblings(numbered, [numbered, entry({ car_id: "Z", model: "Corvette" })]), []);
// "Hot Wheels" and "Hotwheels" are one maker here too.
const hw = entry({ car_id: "H1", brand: "Hot Wheels" });
const hw2 = entry({ car_id: "H2", brand: "Hotwheels", assortment: "Premium" });
assert.deepEqual(
  boxSiblings(hw, [hw, hw2]).map((c) => c.car_id),
  ["H2"],
);
// Never itself.
assert.deepEqual(boxSiblings(numbered, [numbered]), []);

console.log("box-siblings.selfcheck ok");
