/**
 * What findDuplicates must and must not flag, as asserts.
 *
 * Run it:
 *   npx esbuild src/lib/duplicate.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=<tmp>/dup.mjs && node <tmp>/dup.mjs
 *
 * The point of the file is the car-number rule: a shared number is no longer
 * evidence of anything, so a casting that agrees on the number and disagrees
 * on the car must come back clean.
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
    brand: "Mini GT",
    make: "Toyota",
    model: "Supra",
    variant: "",
    colour: "White",
    assortment: "Blister",
    series: "",
    sub_series: "",
    car_number: "",
    year: "2023",
    ...over,
  }) as CatalogCar;

const typed = (over: Partial<DuplicateFields>): DuplicateFields => ({
  brand: "Mini GT",
  make: "Toyota",
  model: "Supra",
  colour: "White",
  assortment: "Blister",
  year: "2023",
  ...over,
});

// ---------------------------------------------------------------- car number

// The whole point. Same brand, same assortment, same number — different car.
const skyline = entry({ make: "Nissan", model: "Skyline", car_number: "1133" });
ok(
  findDuplicates(typed({ carNumber: "1133" }), [skyline]).length === 0,
  "a shared car number alone must not flag a different casting",
);

// And the number must not promote a match that is otherwise only possible.
const otherColour = entry({ colour: "Black", assortment: "Box", car_number: "1133" });
const byNumber = findDuplicates(typed({ carNumber: "1133" }), [otherColour]);
ok(
  byNumber.length === 0 || byNumber[0].level === "possible",
  "car number must not raise a weak match above possible",
);

// It must not appear in the explanation either, or the reason contradicts the rule.
const sameNumberSameCar = entry({ car_number: "1133" });
const explained = findDuplicates(typed({ carNumber: "1133" }), [sameNumberSameCar]);
ok(explained.length === 1, "the same casting is still found when the number also matches");
ok(
  !explained[0].because.toLowerCase().includes("number"),
  "the reason given must not cite the car number",
);

// Dropping the number changes nothing — that is what "judged as if it had none" means.
const withNumber = findDuplicates(typed({ carNumber: "1133" }), [sameNumberSameCar]);
const without = findDuplicates(typed({}), [sameNumberSameCar]);
ok(
  withNumber.length === without.length && withNumber[0].level === without[0].level,
  "a car number must not change the verdict either way",
);

// ------------------------------------------------------- still catches things

ok(
  findDuplicates(typed({}), [entry({})])[0].level === "certain",
  "same make, model, colour, assortment and year is still certain",
);

ok(
  findDuplicates(typed({}), [entry({ brand: "Majorette" })]).length === 0,
  "a different brand is never a duplicate",
);

ok(findDuplicates(typed({ make: "" }), [entry({})]).length === 0, "too little typed to judge yet");

const excluded = entry({});
ok(
  findDuplicates(typed({}), [excluded], { excludeCarId: excluded.car_id }).length === 0,
  "an entry does not duplicate itself while being edited",
);

ok(
  findDuplicates(typed({ colour: "Black" }), [entry({ colour: "White", series: "" })])[0]?.level !==
    "certain",
  "a different colour is not certain",
);

// -------------------------------------------------- needsCarNumber untouched

ok(needsCarNumber("Mini GT") === true, "Mini GT still has to state its number");
ok(needsCarNumber("Hot Wheels") === false, "Hot Wheels prints a position, not a number");
ok(needsCarNumber("Matchbox") === false, "Matchbox prints a position, not a number");
ok(needsCarNumber("") === false, "no brand, nothing to require");

console.log(`duplicate.selfcheck: ${checks} checks passed`);
