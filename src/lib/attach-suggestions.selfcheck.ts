/**
 * What attachSuggestions must and must not offer, as asserts.
 *
 * Run it:
 *   npx esbuild src/lib/attach-suggestions.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=<tmp>/attach.mjs && node <tmp>/attach.mjs
 *
 * The rule under test: brand and collector number agree, which is definite, or
 * brand, make and model agree with variant, series and sub-series not
 * contradicting, which is a guess. Hot Wheels and Matchbox get nothing, because
 * their number is a position in a series and not a product.
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

// 1. Brand and number: the strong rule, and a different box is what makes it a
// box rather than a duplicate.
const box = entry({ car_id: "BOX", assortment: "Box", mrp: 1599 });
const hits = attachSuggestions(mine, [mine, box]);
ok(hits.length === 1 && hits[0].car.car_id === "BOX", "same number in another box is offered");
ok(hits[0].definite, "brand and number agreeing is definite");
ok(/#1377/.test(hits[0].because), "the reason names the number");

// 2. Same box is a second copy of one product, not another package of it.
ok(
  attachSuggestions(mine, [mine, entry({ assortment: "Blister" })]).length === 0,
  "an entry in the same box is not a box suggestion",
);

// 3. Another brand is another product however well the rest reads.
ok(
  attachSuggestions(mine, [mine, entry({ brand: "Tarmac Works", assortment: "Box" })]).length === 0,
  "a different brand is never offered",
);

// 4. Hot Wheels and Matchbox print a position, so the number proves nothing.
for (const brand of ["Hot Wheels", "Hotwheels", "Matchbox"]) {
  const hw = entry({ brand, car_number: "3/5", assortment: "Mainline" });
  ok(
    attachSuggestions(hw, [hw, entry({ brand, car_number: "3/5", assortment: "Moving Parts" })])
      .length === 0,
    `${brand} gets no suggestions`,
  );
}

// 5. No numbers at all: make and model carry it, and a blank series is silence
// rather than a difference.
const bare = entry({ car_id: "BARE", car_number: "", series: "Premium" });
const bareBox = entry({ car_id: "BAREBOX", car_number: "", series: "", assortment: "Box" });
const guess = attachSuggestions(bare, [bare, bareBox]);
ok(
  guess.length === 1 && !guess[0].definite,
  "make and model with nothing contradicting is a guess",
);
ok(/Same make and model/.test(guess[0].because), "the reason says what matched");

// 6. A stated series against a different stated series is a contradiction.
ok(
  attachSuggestions(bare, [bare, entry({ car_number: "", series: "Mainline", assortment: "Box" })])
    .length === 0,
  "two different series are not one casting",
);

// 7. Two stated numbers that differ are two products, description or not.
ok(
  attachSuggestions(mine, [mine, entry({ car_number: "1378", assortment: "Box" })]).length === 0,
  "a different number is not offered on the description alone",
);

// 8. Already a box of this casting: the caller says so and it is not re-offered.
ok(
  attachSuggestions(mine, [mine, box], { exclude: ["BOX"] }).length === 0,
  "an entry already in the group is excluded",
);

// 9. Definite before guess, whatever order the catalogue is in.
const sorted = attachSuggestions(mine, [
  mine,
  entry({ car_number: "", assortment: "Qube Carz" }),
  box,
]);
ok(sorted.length === 2, "both a definite and a guess come back");
ok(sorted[0].definite && !sorted[1].definite, "the definite match is first");

// 10. The limit is honoured.
ok(
  attachSuggestions(
    mine,
    [mine, box, entry({ assortment: "Box 2" }), entry({ assortment: "Box 3" })],
    {
      limit: 2,
    },
  ).length === 2,
  "limit caps the list",
);

console.log(`attach-suggestions self-check: ${checks} checks passed`);
