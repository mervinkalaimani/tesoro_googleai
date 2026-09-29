/**
 * What findDuplicates must and must not offer, as asserts.
 *
 * Run it:
 *   npx esbuild src/lib/duplicate.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=<tmp>/dup.mjs && node <tmp>/dup.mjs
 *
 * The rule under test: brand, make, model and car number, OR every one of
 * brand, make, model, assortment, series, sub-series and car number. Sharing a
 * make and a model is not a duplicate — that was the bug, and "Porsche 911"
 * returning six different castings is the case that proved it. Nor is sharing
 * only a number: Hot Wheels prints a position, so "3/5" is eight castings.
 */
import { findDuplicates, needsCarNumber, type DuplicateFields } from "@/lib/duplicate";
import type { CatalogCar } from "@/lib/catalog";

let checks = 0;
function ok(cond: boolean, what: string) {
  checks++;
  if (!cond) throw new Error(`FAILED: ${what}`);
}

const entry = (over: Partial<CatalogCar>): CatalogCar =>
  ({
    car_id: Math.random().toString(36).slice(2),
    brand: "Hotwheels",
    make: "Porsche",
    model: "911",
    variant: "",
    colour: "White",
    assortment: "Premium",
    series: "Car Culture",
    sub_series: "Circuit Legends",
    car_number: "",
    year: "2023",
    ...over,
  }) as CatalogCar;

const typed = (over: Partial<DuplicateFields>): DuplicateFields => ({
  brand: "Hotwheels",
  make: "Porsche",
  model: "911",
  assortment: "Premium",
  series: "Car Culture",
  subSeries: "Circuit Legends",
  carNumber: "",
  ...over,
});

// ------------------------------------------------ the six-Porsches complaint

ok(
  findDuplicates(typed({ assortment: "Mainline", series: "", subSeries: "" }), [entry({})])
    .length === 0,
  "same make and model but a different assortment is not offered",
);

ok(
  findDuplicates(typed({ series: "Fast & Furious" }), [entry({})]).length === 0,
  "a different series is not offered",
);

ok(
  findDuplicates(typed({ subSeries: "LeMans Set" }), [entry({})]).length === 0,
  "a different sub-series is not offered",
);

ok(
  findDuplicates(typed({}), [entry({ model: "718" })]).length === 0,
  "a different model is not offered",
);

ok(
  findDuplicates(typed({}), [entry({ brand: "Majorette" })]).length === 0,
  "a different brand is never offered",
);

// A blank on one side against a value on the other is a difference, not a match.
ok(
  findDuplicates(typed({ series: "" }), [entry({ series: "Car Culture" })]).length === 0,
  "a blank series does not match a filled one",
);

// ------------------------------------------------------------ what must match

ok(findDuplicates(typed({}), [entry({})]).length === 1, "every field agreeing is offered");

ok(
  findDuplicates(typed({ series: "", subSeries: "" }), [entry({ series: "", sub_series: "" })])
    .length === 1,
  "blank on both sides counts as agreement",
);

// Brand, make, model and number. The number carries the rest of the
// description — assortment, series, sub-series need not agree — but it does not
// carry the car.
const numbered = entry({
  brand: "Mini GT",
  make: "Nissan",
  model: "Skyline",
  assortment: "Box",
  series: "",
  sub_series: "",
  car_number: "1133",
});
const byNumber = findDuplicates(
  typed({ brand: "Mini GT", make: "Nissan", model: "Skyline", carNumber: "1133" }),
  [numbered],
);
ok(byNumber.length === 1, "brand, make, model and number agreeing is a duplicate");
ok(byNumber[0].because.includes("1133"), "and the reason says which number");

ok(
  findDuplicates(typed({ brand: "Mini GT", make: "Toyota", model: "Supra", carNumber: "1133" }), [
    numbered,
  ]).length === 0,
  "a shared number on a different casting is not offered",
);

ok(
  findDuplicates(typed({ brand: "Mini GT", carNumber: "1133" }), [
    entry({ brand: "Majorette", car_number: "1133" }),
  ]).length === 0,
  "the same number under another brand is not offered",
);

// ------------------------------------------------------------------- guards

ok(findDuplicates(typed({ make: "" }), [entry({})]).length === 0, "too little typed to judge yet");

const self = entry({});
ok(
  findDuplicates(typed({}), [self], { excludeCarId: self.car_id }).length === 0,
  "an entry does not duplicate itself while being edited",
);

ok(
  findDuplicates(typed({}), [entry({}), entry({}), entry({})], { limit: 2 }).length === 2,
  "the limit is respected",
);

// -------------------------------------------------- needsCarNumber untouched

ok(needsCarNumber("Mini GT") === true, "Mini GT still has to state its number");
ok(needsCarNumber("Hot Wheels") === false, "Hot Wheels prints a position, not a number");
ok(needsCarNumber("Matchbox") === false, "Matchbox prints a position, not a number");
ok(needsCarNumber("") === false, "no brand, nothing to require");

// ------------------------------------------------------- how close it is
//
// A field either side states is a field that counts. A field blank on both
// sides is not evidence of anything and is left out of the sum — so the score
// is out of what there was to compare, and a form that has not said what colour
// it is scores below one that has.

const full = typed({ carNumber: "" });
const twin = entry({ colour: "", year: "" });
ok(findDuplicates(full, [twin])[0].match === 100, "every stated field agreeing is 100%");

// The entry states a colour and a year the form has not: eight fields counted,
// six of them agreeing.
const vague = findDuplicates(full, [entry({})]);
ok(vague.length === 1, "fields the form has not filled in do not disqualify a match");
ok(vague[0].match === 75, `six of eight fields is 75%, got ${vague[0].match}`);

// Saying the colour, and saying the wrong one, is worse than not saying it.
const wrongColour = findDuplicates(typed({ colour: "Red" }), [entry({ colour: "White" })]);
ok(wrongColour.length === 1, "a colour that differs does not disqualify a match");
ok(wrongColour[0].match < 100, "and it costs the score");

// Closest first.
const ranked = findDuplicates(full, [entry({}), twin]);
ok(ranked[0].match === 100, "the closest match leads");

console.log(`duplicate.selfcheck: ${checks} checks passed`);
