/**
 * What attachSuggestions must and must not offer, as asserts.
 *
 * Run it:
 *   npx esbuild src/lib/attach-suggestions.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=<tmp>/attach.mjs && node <tmp>/attach.mjs
 *
 * The rule under test: brand, make, model and variant must match; colour and
 * number must not contradict, and agreeing on both is definite. Hot Wheels and
 * Matchbox are offered too, with their number ignored.
 */
import { attachSuggestions } from "@/lib/casting-group";
import type { CatalogCar } from "@/lib/catalog";

let checks = 0;
function ok(cond: boolean, what: string) {
  checks++;
  if (!cond) throw new Error(`FAILED: ${what}`);
}

let n = 0;
const entry = (over: Partial<CatalogCar>): CatalogCar =>
  ({
    car_id: `ID${++n}`,
    brand: "Mini GT",
    make: "Lamborghini",
    model: "Huracan",
    variant: "",
    colour: "Blue",
    assortment: "Blister",
    series: "",
    sub_series: "",
    car_number: "1377",
    year: "2024",
    name: "Lamborghini Huracan",
    mrp: 1499,
    ...over,
  }) as CatalogCar;

const mine = entry({ car_id: "MINE" });

// 1. Same casting in another box, colour and number agreeing: definite.
const box = entry({ car_id: "BOX", assortment: "Box", mrp: 1599 });
const hits = attachSuggestions(mine, [mine, box]);
ok(hits.length === 1 && hits[0].car.car_id === "BOX", "same casting in another box is offered");
ok(hits[0].definite, "colour and number agreeing is definite");

// 2. Same box is a second copy of one product, not another package of it.
ok(
  attachSuggestions(mine, [mine, entry({ assortment: "Blister" })]).length === 0,
  "an entry in the same box is not a box suggestion",
);

// 3. Brand, make, model and variant must all match, a blank variant included.
for (const over of [
  { brand: "Tarmac Works" },
  { make: "Ferrari" },
  { model: "Aventador" },
  { variant: "SVJ" },
]) {
  ok(
    attachSuggestions(mine, [mine, entry({ ...over, assortment: "Box" })]).length === 0,
    `a different ${Object.keys(over)[0]} is never offered`,
  );
}

// 4. A stated colour or number that differs is a different car; a blank is not.
ok(
  attachSuggestions(mine, [mine, entry({ colour: "Red", assortment: "Box" })]).length === 0,
  "colour",
);
ok(
  attachSuggestions(mine, [mine, entry({ car_number: "1378", assortment: "Box" })]).length === 0,
  "number",
);
const blank = attachSuggestions(mine, [
  mine,
  entry({ car_number: "-", colour: "", assortment: "Box" }),
]);
ok(blank.length === 1 && !blank[0].definite, "blanks are offered as a guess, not definite");

// 4b. A stated series or sub series that differs is a different car; a blank is not.
const prem = entry({ car_id: "PREM", series: "Premium", sub_series: "Set 1" });
ok(
  attachSuggestions(prem, [prem, entry({ series: "Mainline", assortment: "Box" })]).length === 0,
  "series",
);
ok(
  attachSuggestions(prem, [
    prem,
    entry({ series: "Premium", sub_series: "Set 2", assortment: "Box" }),
  ]).length === 0,
  "sub series",
);
ok(
  attachSuggestions(prem, [prem, entry({ series: "", sub_series: "", assortment: "Box" })])
    .length === 1,
  "blank series is silence",
);

// 5. "-" is not a number, so two dashes do not make a definite match.
const dash = entry({ car_id: "DASH", car_number: "-" });
const dashHit = attachSuggestions(dash, [dash, entry({ car_number: "-", assortment: "Box" })]);
ok(dashHit.length === 1 && !/number/.test(dashHit[0].because), "a dash is no number");

// 6. Hot Wheels and Matchbox are offered, whatever position the box prints.
for (const brand of ["Hot Wheels", "Hotwheels", "Matchbox"]) {
  const hw = entry({ brand, car_number: "3/5", assortment: "Mainline" });
  const other = entry({ brand, car_number: "1/8", assortment: "Moving Parts" });
  ok(attachSuggestions(hw, [hw, other]).length === 1, `${brand} is offered`);
}

// 7. Already a box of this casting: the caller says so and it is not re-offered.
ok(
  attachSuggestions(mine, [mine, box], { exclude: ["BOX"] }).length === 0,
  "an entry already in the group is excluded",
);

// 8. Definite before guess, whatever order the catalogue is in.
const sorted = attachSuggestions(mine, [
  mine,
  entry({ car_number: "", assortment: "Qube Carz" }),
  box,
]);
ok(sorted.length === 2 && sorted[0].definite && !sorted[1].definite, "definite first");

// 9. The limit is honoured.
ok(
  attachSuggestions(
    mine,
    [mine, box, entry({ assortment: "Box 2" }), entry({ assortment: "Box 3" })],
    { limit: 2 },
  ).length === 2,
  "limit caps the list",
);

console.log(`attach-suggestions self-check: ${checks} checks passed`);
